/**
 * COURAGE LIBRARY — CURRENT AFFAIRS FEED ADAPTER SERVICE
 * Phase CA-7.2: Existing News Feed Adapter Implementation
 * Architecture Contract: Frozen v1.2.0
 */

import {
  CurrentAffairsCategory,
  CurrentAffairsImportPayload,
  CurrentAffairsImportanceTier,
  CurrentAffairsSourceTier,
  ExternalNewsFeedItem,
  FeedAdapterTransformResult,
  ALL_CURRENT_AFFAIRS_CATEGORIES,
} from '@/types/current-affairs';
import { sanitizeAiCitationArtifacts } from '@/services/ai/ai-citation-sanitizer';
import { MdxSecurityScanner } from '@/services/mdx-security-scanner';

// Approved Category Mapping Dictionary
const CATEGORY_MAP: Record<string, CurrentAffairsCategory> = {
  national: 'NATIONAL',
  india: 'NATIONAL',
  politics: 'NATIONAL',
  polity: 'NATIONAL',
  international: 'INTERNATIONAL',
  world: 'INTERNATIONAL',
  global: 'INTERNATIONAL',
  diplomacy: 'INTERNATIONAL',
  economy: 'ECONOMY',
  business: 'ECONOMY',
  finance: 'ECONOMY',
  banking: 'ECONOMY',
  markets: 'ECONOMY',
  defence: 'DEFENCE',
  defense: 'DEFENCE',
  military: 'DEFENCE',
  security: 'DEFENCE',
  'defence-security': 'DEFENCE',
  science: 'SCIENCE_TECH',
  tech: 'SCIENCE_TECH',
  technology: 'SCIENCE_TECH',
  space: 'SCIENCE_TECH',
  isro: 'SCIENCE_TECH',
  'science-tech': 'SCIENCE_TECH',
  environment: 'ENVIRONMENT',
  climate: 'ENVIRONMENT',
  ecology: 'ENVIRONMENT',
  wildlife: 'ENVIRONMENT',
  schemes: 'GOVT_SCHEMES',
  yojana: 'GOVT_SCHEMES',
  government: 'GOVT_SCHEMES',
  policy: 'GOVT_SCHEMES',
  'govt-schemes': 'GOVT_SCHEMES',
  sports: 'SPORTS',
  cricket: 'SPORTS',
  olympics: 'SPORTS',
  awards: 'AWARDS_HONOURS',
  honours: 'AWARDS_HONOURS',
  nobel: 'AWARDS_HONOURS',
  padma: 'AWARDS_HONOURS',
  'awards-honours': 'AWARDS_HONOURS',
  person: 'PERSONS_IN_NEWS',
  persons: 'PERSONS_IN_NEWS',
  obituary: 'PERSONS_IN_NEWS',
  appointment: 'PERSONS_IN_NEWS',
  'who-is-who': 'PERSONS_IN_NEWS',
  'persons-in-news': 'PERSONS_IN_NEWS',
  days: 'IMPORTANT_DAYS',
  anniversary: 'IMPORTANT_DAYS',
  'important-days': 'IMPORTANT_DAYS',
  state: 'STATE_SPECIFIC',
  'state-specific': 'STATE_SPECIFIC',
  delhi: 'STATE_SPECIFIC',
  up: 'STATE_SPECIFIC',
  bihar: 'STATE_SPECIFIC',
  maharashtra: 'STATE_SPECIFIC',
};

// Approved Exam Alias Dictionary to Canonical Slugs
const EXAM_ALIAS_MAP: Record<string, string> = {
  upsc: 'upsc-cse',
  'upsc cse': 'upsc-cse',
  'civil services': 'upsc-cse',
  ssc: 'ssc-cgl',
  'ssc cgl': 'ssc-cgl',
  'ssc chsl': 'ssc-cgl',
  'state pcs': 'state-psc',
  bpsc: 'state-psc',
  uppsc: 'state-psc',
  mppsc: 'state-psc',
  ras: 'state-psc',
  banking: 'ibps-po',
  ibps: 'ibps-po',
  'ibps po': 'ibps-po',
  'sbi po': 'ibps-po',
  railway: 'rrb-ntpc',
  'rrb ntpc': 'rrb-ntpc',
  defence: 'defence-services',
  cds: 'defence-services',
  nda: 'defence-services',
};

// Publisher Source Tier Classification
const TIER_1_PUBLISHERS = [
  'press information bureau',
  'pib',
  'gazette of india',
  'reserve bank of india',
  'rbi.org.in',
  'supreme court',
  'sci.gov.in',
  'isro.gov.in',
  'drdo.gov.in',
  'ministry of finance',
  'finmin.nic.in',
  'pib.gov.in',
  '.gov.in',
  '.nic.in',
];

const TIER_2_PUBLISHERS = [
  'who',
  'world health organization',
  'who.int',
  'world bank',
  'worldbank.org',
  'united nations',
  'un.org',
  'imf',
  'imf.org',
  'wto',
  'wto.org',
  'unesco',
  'nature',
  'nature.com',
  'down to earth',
  'downtoearth.org.in',
];

const TIER_3_PUBLISHERS = [
  'the hindu',
  'hindu',
  'thehindu.com',
  'times of india',
  'toi',
  'indiatimes.com',
  'indian express',
  'the indian express',
  'indianexpress.com',
  'ndtv',
  'ndtv.com',
  'frontline',
  'livemint',
  'mint',
  'livemint.com',
  'press trust of india',
  'pti',
  'ptinews.com',
  'economic times',
  'economictimes.indiatimes.com',
  'business standard',
  'business-standard.com',
  'reuters',
  'reuters.com',
  'bbc',
  'bbc.com',
  'bbc.co.uk',
  'associated press',
  'ap',
  'apnews.com',
];

export interface FeedAdapterOptions {
  taxonomyNodeMap?: Record<string, string>; // category -> taxonomyNodeId
  examIdMap?: Record<string, string>; // examSlug -> examId
  defaultTaxonomyNodeId?: string;
}

export class CurrentAffairsFeedAdapter {
  /**
   * Sanitizes and strips tracking parameters from URL
   */
  static cleanUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
      const parsed = new URL(rawUrl.trim());
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'ref',
        'fbclid',
        'gclid',
        '_ga',
      ];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));
      return parsed.toString();
    } catch {
      return rawUrl.trim();
    }
  }

  /**
   * Classifies publisher source into canonical SourceTier
   */
  static classifySourceTier(publisher: string, url: string): CurrentAffairsSourceTier {
    const pubLower = (publisher || '').toLowerCase().trim();
    let hostLower = '';
    try {
      if (url && typeof url === 'string' && url.trim().startsWith('http')) {
        const parsed = new URL(url.trim());
        hostLower = parsed.hostname.toLowerCase();
      }
    } catch {
      hostLower = (url || '').toLowerCase().trim();
    }

    if (TIER_1_PUBLISHERS.some((p) => pubLower === p || pubLower.includes(p) || (hostLower && hostLower.includes(p)))) {
      return 'TIER_1';
    }
    if (TIER_2_PUBLISHERS.some((p) => pubLower === p || pubLower.includes(p) || (hostLower && hostLower.includes(p)))) {
      return 'TIER_2';
    }
    if (TIER_3_PUBLISHERS.some((p) => pubLower === p || pubLower.includes(p) || (hostLower && hostLower.includes(p)))) {
      return 'TIER_3';
    }
    return 'TIER_3'; // Default for established mainstream media feeds
  }

  /**
   * Maps 0-10 numeric importance to 4-tier canonical ImportanceTier
   */
  static mapImportance(rawImportance: unknown): { tier?: CurrentAffairsImportanceTier; error?: string } {
    if (rawImportance === undefined || rawImportance === null || rawImportance === '') {
      return { error: 'Missing importance rating (number 0-10 required).' };
    }

    const num = Number(rawImportance);
    if (isNaN(num)) {
      return { error: `Invalid importance "${rawImportance}": must be a valid number between 0 and 10.` };
    }

    if (num < 0 || num > 10) {
      return { error: `Importance ${num} out of bounds: must be between 0 and 10.` };
    }

    if (num >= 8.0) return { tier: 'CRITICAL' };
    if (num >= 6.0) return { tier: 'HIGH' };
    if (num >= 4.0) return { tier: 'MEDIUM' };
    return { tier: 'LOW' };
  }

  /**
   * Maps incoming category string to frozen 12-category enum
   */
  static mapCategory(rawCat: string): { category?: CurrentAffairsCategory; error?: string } {
    if (!rawCat || typeof rawCat !== 'string' || !rawCat.trim()) {
      return { error: 'Missing primaryCategory field.' };
    }

    const clean = rawCat.trim().toLowerCase();

    // Check uppercase direct match
    const upper = rawCat.trim().toUpperCase() as CurrentAffairsCategory;
    if (ALL_CURRENT_AFFAIRS_CATEGORIES.includes(upper)) {
      return { category: upper };
    }

    // Check dictionary
    if (CATEGORY_MAP[clean]) {
      return { category: CATEGORY_MAP[clean] };
    }

    return {
      error: `Unrecognized category "${rawCat}". Must map to one of the 12 canonical categories: ${ALL_CURRENT_AFFAIRS_CATEGORIES.join(', ')}.`,
    };
  }

  /**
   * Converts ISO UTC date timestamp or date string to IST YYYY-MM-DD
   */
  static parseToIstDateStr(rawDate: string): { dateStr?: string; error?: string } {
    if (!rawDate || typeof rawDate !== 'string' || !rawDate.trim()) {
      return { error: 'Missing date field.' };
    }

    const trimmed = rawDate.trim();

    // If already in YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return { dateStr: trimmed };
      }
    }

    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      return { error: `Invalid date format "${rawDate}": cannot parse into valid calendar date.` };
    }

    // Convert UTC to IST (+05:30)
    const istTime = new Date(parsed.getTime() + 5.5 * 3600 * 1000);
    const dateStr = istTime.toISOString().split('T')[0];
    return { dateStr };
  }

  /**
   * Transforms raw ExternalNewsFeedItem into canonical CurrentAffairsImportPayload
   */
  static transform(
    feedItem: ExternalNewsFeedItem,
    options: FeedAdapterOptions = {}
  ): FeedAdapterTransformResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!feedItem || typeof feedItem !== 'object') {
      return {
        success: false,
        errors: ['Feed item is null or not an object.'],
        warnings: [],
      };
    }

    // 1. Headline / Title
    if (!feedItem.title || typeof feedItem.title !== 'string' || !feedItem.title.trim()) {
      errors.push('Missing required field: title.');
    }
    const cleanHeadline = (feedItem.title || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    if (cleanHeadline.length < 10) {
      errors.push(`Headline "${cleanHeadline}" is too short (minimum 10 characters required).`);
    } else if (cleanHeadline.length > 300) {
      errors.push(`Headline is too long (${cleanHeadline.length} characters; max 300 allowed).`);
    }

    // 2. Date
    const dateRes = this.parseToIstDateStr(feedItem.date);
    if (dateRes.error || !dateRes.dateStr) {
      errors.push(dateRes.error || 'Invalid date.');
    }
    const newsDate = dateRes.dateStr || '';

    // 3. Category
    const catRes = this.mapCategory(feedItem.primaryCategory);
    if (catRes.error || !catRes.category) {
      errors.push(catRes.error || 'Invalid category.');
    }
    const category = catRes.category || 'NATIONAL';

    // 4. Importance Tier
    const impRes = this.mapImportance(feedItem.importance);
    if (impRes.error || !impRes.tier) {
      errors.push(impRes.error || 'Invalid importance.');
    }
    const importanceTier = impRes.tier || 'HIGH';

    // 5. Summary & Key Takeaways
    if (!Array.isArray(feedItem.summary) || feedItem.summary.length === 0) {
      errors.push('Missing required field: summary (must be non-empty array of bullet points).');
    }

    const rawBullets = Array.isArray(feedItem.summary) ? feedItem.summary : [];
    const sanitizedBullets: string[] = [];
    const importantFacts: string[] = [];

    rawBullets.forEach((b) => {
      if (typeof b === 'string' && b.trim()) {
        const cleaned = sanitizeAiCitationArtifacts(b.trim());
        if (cleaned.length >= 5) {
          sanitizedBullets.push(cleaned);

          // Extract tagged facts
          if (/^(exam relevance:|important fact:|key fact:)/i.test(cleaned)) {
            importantFacts.push(cleaned.replace(/^(exam relevance:|important fact:|key fact:)\s*/i, ''));
          }
        }
      }
    });

    if (sanitizedBullets.length === 0) {
      errors.push('Summary bullets are all empty or too short (min 5 chars per bullet).');
    }

    // Construct Markdown Summary
    let summaryMd = sanitizedBullets.join('\n\n');
    if (summaryMd.length < 50 && sanitizedBullets.length > 0) {
      // Synthesize descriptive depth if bullets are brief
      summaryMd = `${cleanHeadline}\n\n${sanitizedBullets.map((b) => `• ${b}`).join('\n')}\n\n*Source: ${feedItem.source || 'National Media Wire'}*`;
    }

    // Security scan on constructed markdown
    const mdxScan = MdxSecurityScanner.scan(summaryMd);
    if (!mdxScan.isSafe) {
      mdxScan.errors.forEach((e) => errors.push(`Security violation in summary: ${e.message}`));
    }

    // 6. Provenance & Source URL
    if (!feedItem.link || typeof feedItem.link !== 'string' || !feedItem.link.trim()) {
      errors.push('Missing required field: link (source URL).');
    }

    const cleanedUrl = this.cleanUrl(feedItem.link || '');
    if (!cleanedUrl.startsWith('https://')) {
      errors.push(`Source URL must use secure HTTPS protocol (received: "${feedItem.link}").`);
    }

    const publisher = (feedItem.source || 'National Media Wire').trim();
    if (!publisher) {
      errors.push('Missing source publisher name.');
    }

    const sourceTier = this.classifySourceTier(publisher, cleanedUrl);
    const citationContext = feedItem.feedName ? `Feed: ${feedItem.feedName.trim()}` : undefined;

    const sources = [
      {
        title: cleanHeadline,
        publisher,
        url: cleanedUrl,
        tier: sourceTier,
        citationContext,
        retrievedAt: new Date().toISOString(),
      },
    ];

    // 7. Taxonomy Mapping
    const defaultNodeId =
      options.taxonomyNodeMap?.[category] ||
      options.defaultTaxonomyNodeId ||
      '00000000-0000-0000-0000-000000000001'; // Default root GS node

    const taxonomyMappings = [
      {
        taxonomyNodeId: defaultNodeId,
        isPrimary: true,
        relevanceScore: 1.0,
      },
    ];

    // 8. Exam Mappings
    const examMappings: Array<{ examId: string; relevanceWeight: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; isHighYield: boolean }> = [];
    if (Array.isArray(feedItem.examTags)) {
      feedItem.examTags.forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) {
          const alias = tag.trim().toLowerCase();
          const canonicalSlug = EXAM_ALIAS_MAP[alias] || alias;
          const mappedExamId = options.examIdMap?.[canonicalSlug];

          if (mappedExamId) {
            examMappings.push({
              examId: mappedExamId,
              relevanceWeight: importanceTier === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
              isHighYield: importanceTier === 'CRITICAL' || importanceTier === 'HIGH',
            });
          } else {
            warnings.push(`Exam tag "${tag}" (slug: ${canonicalSlug}) not resolved to active exam ID.`);
          }
        }
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        externalId: feedItem.id,
        errors,
        warnings,
      };
    }

    const payload: CurrentAffairsImportPayload = {
      headline: cleanHeadline,
      newsDate,
      category,
      importanceTier,
      summaryMd,
      keyTakeaways: sanitizedBullets,
      importantFacts: importantFacts.length > 0 ? importantFacts : undefined,
      sources,
      taxonomyMappings,
      examMappings: examMappings.length > 0 ? examMappings : undefined,
    };

    return {
      success: true,
      externalId: feedItem.id,
      payload,
      errors: [],
      warnings,
    };
  }
}
