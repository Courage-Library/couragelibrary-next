/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE STRUCTURAL DIFF SERVICE
 * Phase 3K.14: Version History & Semantic Diff Workbench
 * 
 * Compares two Exam Knowledge Document Versions structurally and semantically:
 * - Content sections (added, removed, modified, reordered)
 * - Headings, markdown body, callout notes
 * - Metadata (title, description, keywords, category, verification date)
 * - Structured tables, dates, and parameters
 * - FAQs and Official Sources
 * 
 * Guarantees:
 * - Pure, read-only function with zero database side-effects.
 * - Ignores JSON key ordering and cosmetic whitespace noise.
 * - Produces human-readable before/after comparison structures.
 */

import {
  ExamDocDiffResult,
  ExamDocDiffItem,
  ExamDocDiffSection,
  ExamDocDiffChangeType,
} from '@/types/exam-knowledge';

export class ExamKnowledgeDiffService {
  /**
   * Compare two ExamDocVersion records or payloads structurally.
   */
  static compareVersions(versionA: any, versionB: any): ExamDocDiffResult {
    const payloadA = versionA?.structured_payload || {};
    const payloadB = versionB?.structured_payload || {};

    const metadataChanges: ExamDocDiffItem[] = this.compareMetadata(payloadA, payloadB);
    const sectionChanges: ExamDocDiffSection[] = this.compareContentSections(payloadA, payloadB);
    const faqChanges: ExamDocDiffItem[] = this.compareFaqs(payloadA, payloadB);
    const sourceChanges: ExamDocDiffItem[] = this.compareSources(payloadA, payloadB);
    const tableChanges: ExamDocDiffItem[] = this.compareTables(payloadA, payloadB);
    const structuredDataChanges: ExamDocDiffItem[] = this.compareStructuredData(payloadA, payloadB);

    // Calculate Summary Metrics
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;
    let reorderedCount = 0;

    const countItem = (changeType: ExamDocDiffChangeType) => {
      if (changeType === 'ADDED') addedCount++;
      else if (changeType === 'REMOVED') removedCount++;
      else if (changeType === 'CHANGED') modifiedCount++;
      else if (changeType === 'MOVED') reorderedCount++;
    };

    metadataChanges.forEach((i) => countItem(i.changeType));
    faqChanges.forEach((i) => countItem(i.changeType));
    sourceChanges.forEach((i) => countItem(i.changeType));
    tableChanges.forEach((i) => countItem(i.changeType));
    structuredDataChanges.forEach((i) => countItem(i.changeType));

    sectionChanges.forEach((sec) => {
      if (sec.changeType === 'ADDED') addedCount++;
      else if (sec.changeType === 'REMOVED') removedCount++;
      else if (sec.changeType === 'MOVED') reorderedCount++;
      else if (sec.changeType === 'CHANGED') {
        // Count sub-items or at least one modification for the section
        if (sec.items.length > 0) {
          sec.items.forEach((i) => countItem(i.changeType));
        } else {
          modifiedCount++;
        }
      }
    });

    const totalChanges = addedCount + modifiedCount + removedCount + reorderedCount;

    return {
      baseVersion: {
        id: versionA?.id || '',
        versionNumber: versionA?.version_number || 1,
        reviewStatus: versionA?.review_status || 'DRAFT',
        isPublished: Boolean(versionA?.is_published),
        publishedAt: versionA?.published_at || null,
        updatedAt: versionA?.updated_at || '',
      },
      targetVersion: {
        id: versionB?.id || '',
        versionNumber: versionB?.version_number || 2,
        reviewStatus: versionB?.review_status || 'DRAFT',
        isPublished: Boolean(versionB?.is_published),
        publishedAt: versionB?.published_at || null,
        updatedAt: versionB?.updated_at || '',
      },
      summary: {
        totalChanges,
        addedCount,
        modifiedCount,
        removedCount,
        reorderedCount,
        hasChanges: totalChanges > 0,
      },
      metadataChanges,
      sectionChanges,
      faqChanges,
      sourceChanges,
      tableChanges,
      structuredDataChanges,
    };
  }

  /**
   * 1. Metadata Comparison
   */
  private static compareMetadata(a: any, b: any): ExamDocDiffItem[] {
    const metaA = a?.metadata || {};
    const metaB = b?.metadata || {};
    const diffs: ExamDocDiffItem[] = [];

    const checkStringField = (field: string, label: string) => {
      const valA = (metaA[field] || '').trim();
      const valB = (metaB[field] || '').trim();
      if (valA !== valB) {
        let changeType: ExamDocDiffChangeType = 'CHANGED';
        if (!valA && valB) changeType = 'ADDED';
        else if (valA && !valB) changeType = 'REMOVED';

        diffs.push({
          id: `meta-${field}`,
          field: `metadata.${field}`,
          label,
          category: 'METADATA',
          changeType,
          oldValue: valA,
          newValue: valB,
          oldFormatted: valA || '(empty)',
          newFormatted: valB || '(empty)',
          description: `${label} was updated`,
        });
      }
    };

    checkStringField('title', 'Document Title');
    checkStringField('description', 'Description / Summary');
    checkStringField('targetExamCategory', 'Target Exam Category');
    checkStringField('lastVerifiedDate', 'Last Verified Date');

    // Keywords comparison (array)
    const kwA = Array.isArray(metaA.authoritativeKeywords) ? metaA.authoritativeKeywords.map((k: string) => k.trim()).sort() : [];
    const kwB = Array.isArray(metaB.authoritativeKeywords) ? metaB.authoritativeKeywords.map((k: string) => k.trim()).sort() : [];
    if (JSON.stringify(kwA) !== JSON.stringify(kwB)) {
      diffs.push({
        id: 'meta-keywords',
        field: 'metadata.authoritativeKeywords',
        label: 'Authoritative Keywords',
        category: 'METADATA',
        changeType: kwA.length === 0 ? 'ADDED' : kwB.length === 0 ? 'REMOVED' : 'CHANGED',
        oldValue: kwA,
        newValue: kwB,
        oldFormatted: kwA.join(', ') || '(none)',
        newFormatted: kwB.join(', ') || '(none)',
        description: 'Keywords were updated',
      });
    }

    return diffs;
  }

  /**
   * 2. Content Sections Comparison (detects additions, removals, reorderings, body text & callouts)
   */
  private static compareContentSections(a: any, b: any): ExamDocDiffSection[] {
    const rawSecsA: any[] = Array.isArray(a?.contentSections) ? a.contentSections : [];
    const rawSecsB: any[] = Array.isArray(b?.contentSections) ? b.contentSections : [];

    const sectionDiffs: ExamDocDiffSection[] = [];

    // Helper to find match in the other list
    const findMatchingIndex = (sec: any, list: any[]): number => {
      // 1. Try by id if both have valid id
      if (sec.id) {
        const idx = list.findIndex((s) => s.id && s.id === sec.id);
        if (idx !== -1) return idx;
      }
      // 2. Try by heading & sectionType
      const headingNorm = (sec.heading || '').trim().toLowerCase();
      const typeNorm = (sec.sectionType || '').trim().toLowerCase();
      return list.findIndex(
        (s) =>
          (s.heading || '').trim().toLowerCase() === headingNorm &&
          (s.sectionType || '').trim().toLowerCase() === typeNorm
      );
    };

    const matchedInB = new Set<number>();

    // Scan sections in A
    rawSecsA.forEach((secA, idxA) => {
      const idxB = findMatchingIndex(secA, rawSecsB);

      if (idxB === -1) {
        // Section REMOVED
        sectionDiffs.push({
          sectionKey: secA.id || `sec-removed-${idxA}`,
          heading: secA.heading || `Section ${idxA + 1}`,
          sectionType: secA.sectionType || 'SECTION',
          changeType: 'REMOVED',
          oldIndex: idxA,
          items: [
            {
              id: `sec-${idxA}-removed`,
              field: 'contentSections',
              label: secA.heading || `Section ${idxA + 1}`,
              category: 'SECTION',
              changeType: 'REMOVED',
              oldValue: secA.bodyMarkdown,
              newValue: null,
              oldFormatted: secA.bodyMarkdown,
              newFormatted: '(removed)',
              description: `Section "${secA.heading || 'Untitled'}" was removed.`,
            },
          ],
        });
      } else {
        matchedInB.add(idxB);
        const secB = rawSecsB[idxB];
        const itemDiffs: ExamDocDiffItem[] = [];

        // Check if heading changed
        const hA = (secA.heading || '').trim();
        const hB = (secB.heading || '').trim();
        if (hA !== hB) {
          itemDiffs.push({
            id: `sec-${idxA}-heading`,
            field: 'heading',
            label: 'Heading',
            category: 'SECTION',
            changeType: 'CHANGED',
            oldValue: hA,
            newValue: hB,
            oldFormatted: hA,
            newFormatted: hB,
            description: `Heading changed from "${hA}" to "${hB}"`,
          });
        }

        // Check if sectionType changed
        if ((secA.sectionType || '').trim() !== (secB.sectionType || '').trim()) {
          itemDiffs.push({
            id: `sec-${idxA}-type`,
            field: 'sectionType',
            label: 'Section Type',
            category: 'SECTION',
            changeType: 'CHANGED',
            oldValue: secA.sectionType,
            newValue: secB.sectionType,
            oldFormatted: secA.sectionType,
            newFormatted: secB.sectionType,
            description: `Section Type changed to ${secB.sectionType}`,
          });
        }

        // Check if bodyMarkdown changed (normalize line endings and trim)
        const bodyA = (secA.bodyMarkdown || '').replace(/\r\n/g, '\n').trim();
        const bodyB = (secB.bodyMarkdown || '').replace(/\r\n/g, '\n').trim();
        if (bodyA !== bodyB) {
          itemDiffs.push({
            id: `sec-${idxA}-body`,
            field: 'bodyMarkdown',
            label: 'Content Body',
            category: 'SECTION',
            changeType: 'CHANGED',
            oldValue: bodyA,
            newValue: bodyB,
            oldFormatted: bodyA,
            newFormatted: bodyB,
            description: 'Section markdown text was updated',
          });
        }

        // Check callout notes
        const notesA = JSON.stringify(secA.calloutNotes || []);
        const notesB = JSON.stringify(secB.calloutNotes || []);
        if (notesA !== notesB) {
          itemDiffs.push({
            id: `sec-${idxA}-notes`,
            field: 'calloutNotes',
            label: 'Callout Notes',
            category: 'SECTION',
            changeType: 'CHANGED',
            oldValue: secA.calloutNotes,
            newValue: secB.calloutNotes,
            oldFormatted: (secA.calloutNotes || []).map((n: any) => `[${n.variant}] ${n.title}: ${n.body}`).join('\n') || '(none)',
            newFormatted: (secB.calloutNotes || []).map((n: any) => `[${n.variant}] ${n.title}: ${n.body}`).join('\n') || '(none)',
            description: 'Callout notes were updated',
          });
        }

        // Check reordering
        const isMoved = idxA !== idxB;
        let changeType: ExamDocDiffChangeType = 'UNCHANGED';
        if (itemDiffs.length > 0) {
          changeType = 'CHANGED';
        } else if (isMoved) {
          changeType = 'MOVED';
          itemDiffs.push({
            id: `sec-${idxA}-order`,
            field: 'position',
            label: 'Section Order',
            category: 'SECTION',
            changeType: 'MOVED',
            oldValue: idxA + 1,
            newValue: idxB + 1,
            oldFormatted: `Position ${idxA + 1}`,
            newFormatted: `Position ${idxB + 1}`,
            description: `Section moved from position ${idxA + 1} to position ${idxB + 1}`,
          });
        }

        sectionDiffs.push({
          sectionKey: secB.id || `sec-${idxB}`,
          heading: secB.heading || `Section ${idxB + 1}`,
          sectionType: secB.sectionType || 'SECTION',
          changeType,
          oldIndex: idxA,
          newIndex: idxB,
          items: itemDiffs,
        });
      }
    });

    // Scan for new sections in B that were not in A
    rawSecsB.forEach((secB, idxB) => {
      if (!matchedInB.has(idxB)) {
        sectionDiffs.push({
          sectionKey: secB.id || `sec-added-${idxB}`,
          heading: secB.heading || `Section ${idxB + 1}`,
          sectionType: secB.sectionType || 'SECTION',
          changeType: 'ADDED',
          newIndex: idxB,
          items: [
            {
              id: `sec-${idxB}-added`,
              field: 'contentSections',
              label: secB.heading || `Section ${idxB + 1}`,
              category: 'SECTION',
              changeType: 'ADDED',
              oldValue: null,
              newValue: secB.bodyMarkdown,
              oldFormatted: '(none)',
              newFormatted: secB.bodyMarkdown,
              description: `New section "${secB.heading || 'Untitled'}" was added.`,
            },
          ],
        });
      }
    });

    return sectionDiffs;
  }

  /**
   * 3. FAQs Comparison
   */
  private static compareFaqs(a: any, b: any): ExamDocDiffItem[] {
    const faqsA: Array<{ question: string; answer: string }> = Array.isArray(a?.faqs) ? a.faqs : [];
    const faqsB: Array<{ question: string; answer: string }> = Array.isArray(b?.faqs) ? b.faqs : [];
    const diffs: ExamDocDiffItem[] = [];

    const normQ = (q: string) => (q || '').trim().toLowerCase();
    const matchedB = new Set<number>();

    faqsA.forEach((faqA, idxA) => {
      const qA = (faqA.question || '').trim();
      const ansA = (faqA.answer || '').trim();
      const idxB = faqsB.findIndex((f) => normQ(f.question) === normQ(qA));

      if (idxB === -1) {
        diffs.push({
          id: `faq-removed-${idxA}`,
          field: 'faqs',
          label: `FAQ: ${qA}`,
          category: 'FAQ',
          changeType: 'REMOVED',
          oldValue: ansA,
          newValue: null,
          oldFormatted: `Q: ${qA}\nA: ${ansA}`,
          newFormatted: '(removed)',
          description: `FAQ "${qA}" was removed.`,
        });
      } else {
        matchedB.add(idxB);
        const faqB = faqsB[idxB];
        const ansB = (faqB.answer || '').trim();
        if (ansA !== ansB) {
          diffs.push({
            id: `faq-changed-${idxA}`,
            field: 'faqs',
            label: `FAQ: ${qA}`,
            category: 'FAQ',
            changeType: 'CHANGED',
            oldValue: ansA,
            newValue: ansB,
            oldFormatted: ansA,
            newFormatted: ansB,
            description: `Answer for FAQ "${qA}" was updated.`,
          });
        }
      }
    });

    faqsB.forEach((faqB, idxB) => {
      if (!matchedB.has(idxB)) {
        const qB = (faqB.question || '').trim();
        const ansB = (faqB.answer || '').trim();
        diffs.push({
          id: `faq-added-${idxB}`,
          field: 'faqs',
          label: `FAQ: ${qB}`,
          category: 'FAQ',
          changeType: 'ADDED',
          oldValue: null,
          newValue: ansB,
          oldFormatted: '(none)',
          newFormatted: `Q: ${qB}\nA: ${ansB}`,
          description: `New FAQ "${qB}" was added.`,
        });
      }
    });

    return diffs;
  }

  /**
   * 4. Official Sources Comparison
   */
  private static compareSources(a: any, b: any): ExamDocDiffItem[] {
    const srcsA: any[] = Array.isArray(a?.officialSources) ? a.officialSources : [];
    const srcsB: any[] = Array.isArray(b?.officialSources) ? b.officialSources : [];
    const diffs: ExamDocDiffItem[] = [];

    const normUrl = (u: string) => (u || '').trim().toLowerCase();
    const matchedB = new Set<number>();

    srcsA.forEach((srcA, idxA) => {
      const urlA = (srcA.url || srcA.sourceUrl || '').trim();
      const titleA = (srcA.title || '').trim();
      const authA = (srcA.issuingAuthority || srcA.authorityName || '').trim();

      const idxB = srcsB.findIndex((s) => normUrl(s.url || s.sourceUrl) === normUrl(urlA) || (s.title && s.title.trim().toLowerCase() === titleA.toLowerCase()));

      if (idxB === -1) {
        diffs.push({
          id: `src-removed-${idxA}`,
          field: 'officialSources',
          label: `Source: ${titleA || urlA}`,
          category: 'SOURCE',
          changeType: 'REMOVED',
          oldValue: srcA,
          newValue: null,
          oldFormatted: `${titleA} (${authA}) - ${urlA}`,
          newFormatted: '(removed)',
          description: `Official Source "${titleA}" was removed.`,
        });
      } else {
        matchedB.add(idxB);
        const srcB = srcsB[idxB];
        const urlB = (srcB.url || srcB.sourceUrl || '').trim();
        const titleB = (srcB.title || '').trim();
        const authB = (srcB.issuingAuthority || srcB.authorityName || '').trim();

        if (urlA !== urlB || titleA !== titleB || authA !== authB) {
          diffs.push({
            id: `src-changed-${idxA}`,
            field: 'officialSources',
            label: `Source: ${titleB || titleA}`,
            category: 'SOURCE',
            changeType: 'CHANGED',
            oldValue: srcA,
            newValue: srcB,
            oldFormatted: `${titleA} (${authA}) - ${urlA}`,
            newFormatted: `${titleB} (${authB}) - ${urlB}`,
            description: `Official Source details updated.`,
          });
        }
      }
    });

    srcsB.forEach((srcB, idxB) => {
      if (!matchedB.has(idxB)) {
        const urlB = (srcB.url || srcB.sourceUrl || '').trim();
        const titleB = (srcB.title || '').trim();
        const authB = (srcB.issuingAuthority || srcB.authorityName || '').trim();
        diffs.push({
          id: `src-added-${idxB}`,
          field: 'officialSources',
          label: `Source: ${titleB || urlB}`,
          category: 'SOURCE',
          changeType: 'ADDED',
          oldValue: null,
          newValue: srcB,
          oldFormatted: '(none)',
          newFormatted: `${titleB} (${authB}) - ${urlB}`,
          description: `New Official Source "${titleB}" was added.`,
        });
      }
    });

    return diffs;
  }

  /**
   * 5. Tables Comparison
   */
  private static compareTables(a: any, b: any): ExamDocDiffItem[] {
    const tblsA: any[] = Array.isArray(a?.structuredData?.tables) ? a.structuredData.tables : [];
    const tblsB: any[] = Array.isArray(b?.structuredData?.tables) ? b.structuredData.tables : [];
    const diffs: ExamDocDiffItem[] = [];

    const matchedB = new Set<number>();

    tblsA.forEach((tblA, idxA) => {
      const idA = tblA.tableId || tblA.title;
      const idxB = tblsB.findIndex((t) => (t.tableId || t.title) === idA);

      if (idxB === -1) {
        diffs.push({
          id: `tbl-removed-${idxA}`,
          field: 'structuredData.tables',
          label: `Table: ${tblA.title || idA}`,
          category: 'TABLE',
          changeType: 'REMOVED',
          oldValue: tblA,
          newValue: null,
          oldFormatted: `Table "${tblA.title}" with ${tblA.rows?.length || 0} rows`,
          newFormatted: '(removed)',
          description: `Table "${tblA.title}" was removed.`,
        });
      } else {
        matchedB.add(idxB);
        const tblB = tblsB[idxB];
        const jsonA = JSON.stringify({ title: tblA.title, headers: tblA.headers, rows: tblA.rows });
        const jsonB = JSON.stringify({ title: tblB.title, headers: tblB.headers, rows: tblB.rows });
        if (jsonA !== jsonB) {
          diffs.push({
            id: `tbl-changed-${idxA}`,
            field: 'structuredData.tables',
            label: `Table: ${tblB.title || tblA.title}`,
            category: 'TABLE',
            changeType: 'CHANGED',
            oldValue: tblA,
            newValue: tblB,
            oldFormatted: `${tblA.title} (${tblA.rows?.length || 0} rows)`,
            newFormatted: `${tblB.title} (${tblB.rows?.length || 0} rows)`,
            description: `Table "${tblB.title}" data or structure was updated.`,
          });
        }
      }
    });

    tblsB.forEach((tblB, idxB) => {
      if (!matchedB.has(idxB)) {
        diffs.push({
          id: `tbl-added-${idxB}`,
          field: 'structuredData.tables',
          label: `Table: ${tblB.title || tblB.tableId}`,
          category: 'TABLE',
          changeType: 'ADDED',
          oldValue: null,
          newValue: tblB,
          oldFormatted: '(none)',
          newFormatted: `Table "${tblB.title}" with ${tblB.rows?.length || 0} rows`,
          description: `New table "${tblB.title}" was added.`,
        });
      }
    });

    return diffs;
  }

  /**
   * 6. Structured Data (Important Dates & Parameters) Comparison
   */
  private static compareStructuredData(a: any, b: any): ExamDocDiffItem[] {
    const datesA: any[] = Array.isArray(a?.structuredData?.dates) ? a.structuredData.dates : [];
    const datesB: any[] = Array.isArray(b?.structuredData?.dates) ? b.structuredData.dates : [];
    const diffs: ExamDocDiffItem[] = [];

    const matchedB = new Set<number>();

    datesA.forEach((dA, idxA) => {
      const keyA = dA.eventKey || dA.label;
      const idxB = datesB.findIndex((d) => (d.eventKey || d.label) === keyA);

      if (idxB === -1) {
        diffs.push({
          id: `date-removed-${idxA}`,
          field: 'structuredData.dates',
          label: `Date: ${dA.label || keyA}`,
          category: 'STRUCTURED_DATA',
          changeType: 'REMOVED',
          oldValue: dA,
          newValue: null,
          oldFormatted: `${dA.label}: ${dA.dateValue} (${dA.isTentative ? 'Tentative' : 'Confirmed'})`,
          newFormatted: '(removed)',
          description: `Important date "${dA.label}" was removed.`,
        });
      } else {
        matchedB.add(idxB);
        const dB = datesB[idxB];
        if (dA.dateValue !== dB.dateValue || dA.isTentative !== dB.isTentative) {
          diffs.push({
            id: `date-changed-${idxA}`,
            field: 'structuredData.dates',
            label: `Date: ${dB.label || dA.label}`,
            category: 'STRUCTURED_DATA',
            changeType: 'CHANGED',
            oldValue: dA,
            newValue: dB,
            oldFormatted: `${dA.dateValue} (${dA.isTentative ? 'Tentative' : 'Confirmed'})`,
            newFormatted: `${dB.dateValue} (${dB.isTentative ? 'Tentative' : 'Confirmed'})`,
            description: `Important date value was updated.`,
          });
        }
      }
    });

    datesB.forEach((dB, idxB) => {
      if (!matchedB.has(idxB)) {
        diffs.push({
          id: `date-added-${idxB}`,
          field: 'structuredData.dates',
          label: `Date: ${dB.label || dB.eventKey}`,
          category: 'STRUCTURED_DATA',
          changeType: 'ADDED',
          oldValue: null,
          newValue: dB,
          oldFormatted: '(none)',
          newFormatted: `${dB.label}: ${dB.dateValue} (${dB.isTentative ? 'Tentative' : 'Confirmed'})`,
          description: `New important date "${dB.label}" was added.`,
        });
      }
    });

    return diffs;
  }
}
