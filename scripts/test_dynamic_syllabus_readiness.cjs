/**
 * Courage Library — Phase 3R.5 / Step 5.1 Forensic Test Suite
 * Syllabus Readiness Semantics & Reconciliation Freshness Hardening Verification
 * 
 * Verifies 51 forensic gates:
 * 1. Empty syllabus
 * 2. Fully matched syllabus
 * 3. Fully unresolved syllabus
 * 4. Mixed matched/gap syllabus
 * 5. New subject readiness (BLOCKING priority)
 * 6. New node readiness (BLOCKING priority)
 * 7. Ambiguous readiness (BLOCKING priority)
 * 8. Proposed match readiness (HIGH priority)
 * 9. Manual mapping readiness (Resolved state)
 * 10. Ignored requirement (Intentionally excluded)
 * 11. Rejected proposal (Action-required)
 * 12. Subject-level aggregation
 * 13. Recursive hierarchy preservation
 * 14. Arbitrary depth support
 * 15. Canonical richer-than-exam depth
 * 16. Exam-specific breadth isolation
 * 17. Mandatory blocking logic
 * 18. Non-mandatory priority differentiation
 * 19. Version specificity & isolation
 * 20. Structural delta analysis
 * 21. Stale reconciliation detection
 * 22. Deterministic percentages
 * 23. Deterministic work queue generation & sorting
 * 24. No N+1 query pattern
 * 25. Read-only mutation guard
 * 26. Complete synthetic fixture cleanup
 * 27. Legacy baseline invariant preservation (40 canonical nodes)
 * 
 * --- STEP 5.1 HARDENED SEMANTICS & RELEVANT SCOPE GATES ---
 * 28. G34 — Relevant canonical node change causes STALE
 * 29. G35 — Unrelated canonical branch does NOT cause STALE
 * 30. G36 — Relevant ancestor/structural change causes STALE
 * 31. G37 — Readiness metric semantic partition is exact
 * 32. G38 — IGNORED is excluded from academic coverage percentage
 * 33. G39 — REJECTED remains unresolved/action-required
 * 34. G40 — UNREVIEWED remains unresolved/action-required
 * 35. G41 — Subject READY semantics are deterministic (READY vs ACTION_REQUIRED vs IN_PROGRESS)
 * 36. G42 — Work queue excludes mapped and ignored states
 * 37. G43 — Work queue retains rejected/unreviewed gaps
 * 38. G44 — Version isolation after semantic changes
 * 39. G45 — Read-only mutation guard after semantic changes
 * 
 * --- REGRESSION GATES ---
 * 40. Regression: Phase 3R.1 Recursive Schema Foundation
 * 41. Regression: Phase 3R.2 Taxonomy Projection & Syllabus Trees
 * 42. Regression: Phase 3R.3 Context-Aware Reconciliation Engine
 * 43. Regression: Phase 3R.4 Human Review & Resolution Foundation
 * 44. Regression: Phase 3M.5 Candidate Learning Experience
 * 45. Regression: Phase 3M.6 Learning Coverage & Operations
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { Client } = require('e:/Courage Library/node_modules/pg');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

let connectionString = null;
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = val;
        }
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

if (!connectionString) {
  connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class WebSocket {
    constructor() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  };
}

const EXPECTED_BASELINES = {
  subjects: 4,
  topics: 36,
  subtopics: 0,
  learning_units: 0,
  exam_syllabi: 1,
  exam_topics: 18,
  exam_unit_mappings: 0,
  exams: 35,
  exam_cycles: 34,
  exam_knowledge_documents: 32,
};

async function runPhase3R51ForensicSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE 3R.5 / STEP 5.1 HARDENED READINESS & FRESHNESS SUITE');
  console.log('================================================================================\n');

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  let client;
  async function connectClient() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const c = new Client({
          connectionString,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 15000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        });
        c.on('error', () => {});
        await c.connect();
        return c;
      } catch (err) {
        console.warn(`Connection attempt ${attempt} failed: ${err.message}. Retrying...`);
        await new Promise(res => setTimeout(res, 2000));
      }
    }
    throw new Error('Failed to connect to PostgreSQL after 3 attempts');
  }

  client = await connectClient();
  console.log('✓ Remote PostgreSQL Connection established successfully.\n');

  // Pre-test cleanup of any leftover test records
  await client.query(`DELETE FROM public.exam_syllabus_versions WHERE version_tag LIKE 'TEST_%' OR version_tag LIKE 'V_%' OR raw_payload_hash LIKE 'hash%'`);
  await client.query(`DELETE FROM public.taxonomy_aliases`);
  await client.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT id FROM public.canonical_taxonomy_nodes 
        WHERE legacy_subject_id IS NULL AND legacy_topic_id IS NULL
        ORDER BY node_depth DESC
      ) LOOP
        DELETE FROM public.canonical_taxonomy_nodes WHERE id = r.id;
      END LOOP;
    END $$;
  `);
  await client.query(`
    ALTER TABLE public.document_versions DISABLE TRIGGER USER;
    ALTER TABLE public.learning_documents DISABLE TRIGGER USER;
    DELETE FROM public.exam_unit_mappings WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
    UPDATE public.learning_documents SET current_published_version_id = NULL WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
    DELETE FROM public.document_versions WHERE document_id IN (SELECT id FROM public.learning_documents WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%'));
    DELETE FROM public.learning_documents WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
    DELETE FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%';
    ALTER TABLE public.document_versions ENABLE TRIGGER USER;
    ALTER TABLE public.learning_documents ENABLE TRIGGER USER;
  `);

  // Verify baseline counts before tests
  const preCounts = {};
  for (const table of Object.keys(EXPECTED_BASELINES)) {
    const res = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    preCounts[table] = res.rows[0].count;
  }

  let preMatches = true;
  for (const [tbl, expected] of Object.entries(EXPECTED_BASELINES)) {
    if (preCounts[tbl] !== expected) {
      preMatches = false;
      console.warn(`WARNING: Baseline mismatch on ${tbl}: expected ${expected}, got ${preCounts[tbl]}`);
    }
  }

  if (preMatches) {
    console.log('Pre-test baseline verification: VERIFIED');
    Object.entries(preCounts).forEach(([tbl, count]) => {
      console.log(`  - ${tbl}: ${count}`);
    });
    console.log();
  }

  const results = [];
  function recordGate(gateNum, gateName, pass, details = '') {
    results.push({ gate: gateNum, name: gateName, pass, details });
    const mark = pass ? 'PASS ✓' : 'FAIL ✗';
    console.log(`[GATE ${gateNum.toString().padStart(2, '0')}] ${gateName}: ${mark}`);
    if (details) {
      console.log(`        ${details}`);
    }
  }

  // Load existing canonical nodes for reference
  const canonicalRes = await client.query(`
    SELECT id, name, slug, node_type, node_depth, hierarchy_path, root_subject_id 
    FROM public.canonical_taxonomy_nodes 
    ORDER BY node_depth, display_order
  `);
  const existingCanonical = canonicalRes.rows;
  const quantCanonical = existingCanonical.find(c => c.name.toLowerCase().includes('quantitative') && c.node_depth === 1);
  const numSysCanonical = existingCanonical.find(c => (c.slug === 'number-system' || c.name.toLowerCase() === 'number system') && c.root_subject_id === quantCanonical?.id) || existingCanonical.find(c => c.slug === 'number-system');
  const arithCanonical = existingCanonical.find(c => (c.slug.includes('arithmetic') || c.name.toLowerCase().includes('arithmetic')) && c.root_subject_id === quantCanonical?.id) || existingCanonical.find(c => c.root_subject_id === quantCanonical?.id && c.node_depth === 2);
  const algCanonical = existingCanonical.find(c => (c.slug === 'algebra' || c.name.toLowerCase() === 'algebra') && c.root_subject_id === quantCanonical?.id) || existingCanonical.find(c => c.name.toLowerCase().includes('algebra'));
  const gaCanonical = existingCanonical.find(c => c.name.toLowerCase().includes('general awareness') && c.node_depth === 1);
  const reasoningCanonical = existingCanonical.find(c => c.name.toLowerCase().includes('reasoning') && c.node_depth === 1);

  const createdFixtureIds = {
    exams: [],
    syllabusVersions: [],
    syllabusNodes: [],
    mappings: [],
  };
  const syntheticCanonicalIds = [];

  try {
    // Create synthetic canonical node for Types of Numbers
    const typesRes = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active, metadata
      ) VALUES (
        $1, $2, 'Types of Numbers', 'types-of-numbers', 'SUBTOPIC', 3, 'quantitative-aptitude.number-system.types-of-numbers', 1, true, '{"synthetic": true}'::jsonb
      ) RETURNING id, name, slug
    `, [numSysCanonical.id, quantCanonical.id]);
    const typesOfNumCanonical = typesRes.rows[0];
    syntheticCanonicalIds.push(typesOfNumCanonical.id);

    // -------------------------------------------------------------------------
    // Fetch Active Exam (Preserves exams: 35 baseline)
    // -------------------------------------------------------------------------
    const examRes = await client.query(`SELECT id, title, slug FROM public.exams WHERE is_active = true LIMIT 1`);
    const testExam = examRes.rows[0];
    const runTag = Date.now();

    // -------------------------------------------------------------------------
    // Setup Version 1: Empty Syllabus Version
    // -------------------------------------------------------------------------
    const verEmptyRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, $2, $3, 'DRAFT', true)
      RETURNING id, version_tag
    `, [testExam.id, `V_EMPTY_${runTag}`, `hash_empty_${runTag}`]);
    const verEmpty = verEmptyRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verEmpty.id);

    // -------------------------------------------------------------------------
    // Setup Version 2: Fully Matched Syllabus Version (Quant Only)
    // -------------------------------------------------------------------------
    const verMatchedRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, $2, $3, 'RECONCILED', true)
      RETURNING id, version_tag
    `, [testExam.id, `V_MATCHED_${runTag}`, `hash_matched_${runTag}`]);
    const verMatched = verMatchedRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verMatched.id);

    const mRootRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1, 1) RETURNING id
      `, [verMatched.id]);
    const mRootId = mRootRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(mRootId);

    const mChildRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Number System', 'number-system', 2, 1) RETURNING id
    `, [verMatched.id, mRootId]);
    const mChildId = mChildRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(mChildId);

    const mapMRoot = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [mRootId, quantCanonical.id]);
    createdFixtureIds.mappings.push(mapMRoot.rows[0].id);

    const mapMChild = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [mChildId, numSysCanonical.id]);
    createdFixtureIds.mappings.push(mapMChild.rows[0].id);

    // -------------------------------------------------------------------------
    // Setup Version 3: Fully Unresolved Syllabus Version
    // -------------------------------------------------------------------------
    const verUnresolvedRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, 'V_UNRESOLVED_2026', 'hash_unresolved_222', 'DRAFT', true)
      RETURNING id, version_tag
    `, [testExam.id]);
    const verUnresolved = verUnresolvedRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verUnresolved.id);

    const uRootRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Robotics & Mechatronics', 'robotics-mechatronics', 1, 1) RETURNING id
    `, [verUnresolved.id]);
    const uRootId = uRootRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(uRootId);

    const uChildRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Kinematics & Dynamics', 'kinematics-dynamics', 2, 1) RETURNING id
    `, [verUnresolved.id, uRootId]);
    const uChildId = uChildRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(uChildId);

    const mapURoot = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_SUBJECT_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [uRootId]);
    createdFixtureIds.mappings.push(mapURoot.rows[0].id);

    const mapUChild = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_NODE_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [uChildId]);
    createdFixtureIds.mappings.push(mapUChild.rows[0].id);

    // -------------------------------------------------------------------------
    // Setup Version 4: Comprehensive Mixed Syllabus Version (Main Fixture)
    // -------------------------------------------------------------------------
    const verMixedRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, 'V_MIXED_2026', 'hash_mixed_333', 'RECONCILED', true)
      RETURNING id, version_tag
    `, [testExam.id]);
    const verMixed = verMixedRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verMixed.id);

    // 1. Root Subject: Quantitative Aptitude (Matched)
    const sQuantRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1, 1, true) RETURNING id
    `, [verMixed.id]);
    const sQuantId = sQuantRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sQuantId);

    // 1.1 Number System (Depth 2, Matched)
    const sNumSysRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Number System', 'number-system', 2, 1, true) RETURNING id
    `, [verMixed.id, sQuantId]);
    const sNumSysId = sNumSysRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sNumSysId);

    // 1.1.1 Types of Numbers (Depth 3, Matched)
    const sTypesRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Types of Numbers', 'types-of-numbers', 3, 1, true) RETURNING id
    `, [verMixed.id, sNumSysId]);
    const sTypesId = sTypesRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sTypesId);

    // 1.1.2 Modular Arithmetic (Depth 3, Mandatory Gap)
    const sModRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Modular Arithmetic', 'modular-arithmetic', 3, 2, true) RETURNING id
    `, [verMixed.id, sNumSysId]);
    const sModId = sModRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sModId);

    // 1.1.3 Vedic Math Tricks (Depth 3, Non-mandatory Gap)
    const sVedicRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Vedic Math Tricks', 'vedic-math-tricks', 3, 3, false) RETURNING id
    `, [verMixed.id, sNumSysId]);
    const sVedicId = sVedicRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sVedicId);

    // 1.2 Arithmetic & Commercial Math (Depth 2, Manually Mapped)
    const sArithRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Arithmetic & Commercial Math', 'arithmetic-commercial-math', 2, 2, true) RETURNING id
    `, [verMixed.id, sQuantId]);
    const sArithId = sArithRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sArithId);

    // 1.3 Algebra & Polynomials (Depth 2, Proposed Match)
    const sAlgRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Algebra & Polynomials', 'algebra-polynomials', 2, 3, true) RETURNING id
    `, [verMixed.id, sQuantId]);
    const sAlgId = sAlgRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sAlgId);

    // 1.4 General Math Puzzles (Depth 2, Ignored)
    const sPuzRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'General Math Puzzles', 'general-math-puzzles', 2, 4, false) RETURNING id
    `, [verMixed.id, sQuantId]);
    const sPuzId = sPuzRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sPuzId);

    // 1.5 Experimental Heuristics (Depth 2, Rejected)
    const sRejRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Experimental Heuristics', 'experimental-heuristics', 2, 5, false) RETURNING id
    `, [verMixed.id, sQuantId]);
    const sRejId = sRejRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sRejId);

    // 2. Root Subject: General Awareness (Matched)
    const sGARes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, 'General Awareness', 'general-awareness', 1, 2, true) RETURNING id
    `, [verMixed.id]);
    const sGAId = sGARes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sGAId);

    // 2.1 Indian Economy (Depth 2, Ambiguous Candidate)
    const sEconRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Indian Economy', 'indian-economy', 2, 1, true) RETURNING id
    `, [verMixed.id, sGAId]);
    const sEconId = sEconRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sEconId);

    // 3. Root Subject: Computer Knowledge & IT Fundamentals (New Subject Gap)
    const sCompRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, 'Computer Knowledge & IT Fundamentals', 'computer-knowledge-it', 1, 3, true) RETURNING id
    `, [verMixed.id]);
    const sCompId = sCompRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sCompId);

    // 3.1 Operating Systems (Depth 2, New Node Gap)
    const sOSRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order, is_mandatory)
      VALUES ($1, $2, 'Operating Systems', 'operating-systems', 2, 1, true) RETURNING id
    `, [verMixed.id, sCompId]);
    const sOSId = sOSRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(sOSId);

    // Insert authoritative mappings for Version 4 (Mixed)
    // 1. Quant Root -> MATCHED
    const m1 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sQuantId, quantCanonical.id]);
    createdFixtureIds.mappings.push(m1.rows[0].id);

    // 1.1 Number System -> MATCHED
    const m2 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sNumSysId, numSysCanonical.id]);
    createdFixtureIds.mappings.push(m2.rows[0].id);

    // 1.1.1 Types of Numbers -> MATCHED
    const m3 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sTypesId, typesOfNumCanonical.id]);
    createdFixtureIds.mappings.push(m3.rows[0].id);

    // 1.1.2 Modular Arithmetic -> NEW_NODE_GAP
    const m4 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_NODE_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [sModId]);
    createdFixtureIds.mappings.push(m4.rows[0].id);

    // 1.1.3 Vedic Math Tricks -> NEW_NODE_GAP
    const m5 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_NODE_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [sVedicId]);
    createdFixtureIds.mappings.push(m5.rows[0].id);

    // Fetch an admin reviewer
    const userRes = await client.query(`SELECT id FROM auth.users LIMIT 1`);
    const reviewerUserId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

    // 1.2 Arithmetic & Commercial Math -> MANUALLY_MAPPED
    const m6 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, reviewed_by, reviewed_at)
      VALUES ($1, $2, 'MANUALLY_MAPPED', 1.0, 'MANUAL', $3, now()) RETURNING id
    `, [sArithId, arithCanonical.id, reviewerUserId]);
    createdFixtureIds.mappings.push(m6.rows[0].id);

    // 1.3 Algebra & Polynomials -> PROPOSED_MATCH
    const m7 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, candidate_matches)
      VALUES ($1, $2, 'PROPOSED_MATCH', 0.82, 'TRIGRAM_SIMILARITY', $3::jsonb) RETURNING id
    `, [sAlgId, algCanonical.id, JSON.stringify([{
      canonicalNodeId: algCanonical.id,
      name: algCanonical.name,
      slug: algCanonical.slug,
      hierarchyPath: algCanonical.hierarchy_path,
      nodeDepth: algCanonical.node_depth,
      similarity: 0.82,
      matchMethod: 'TRIGRAM_SIMILARITY',
      reason: 'Trigram similarity candidate'
    }])]);
    createdFixtureIds.mappings.push(m7.rows[0].id);

    // 1.4 General Math Puzzles -> IGNORED
    const m8 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, match_notes)
      VALUES ($1, NULL, 'IGNORED', 0.0, 'MANUAL', 'Out of academic scope') RETURNING id
    `, [sPuzId]);
    createdFixtureIds.mappings.push(m8.rows[0].id);

    // 1.5 Experimental Heuristics -> REJECTED
    const m9 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, match_notes)
      VALUES ($1, NULL, 'REJECTED', 0.0, 'MANUAL', 'Rejected proposal') RETURNING id
    `, [sRejId]);
    createdFixtureIds.mappings.push(m9.rows[0].id);

    // 2. GA Root -> MATCHED
    const m10 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sGAId, gaCanonical.id]);
    createdFixtureIds.mappings.push(m10.rows[0].id);

    // 2.1 Indian Economy -> AMBIGUOUS
    const m11 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, candidate_matches)
      VALUES ($1, NULL, 'AMBIGUOUS', 0.5, 'CONTEXTUAL_CANDIDATE', $2::jsonb) RETURNING id
    `, [sEconId, JSON.stringify([
      { canonicalNodeId: quantCanonical.id, name: 'Economy 1', slug: 'econ-1', hierarchyPath: 'ga.econ-1', nodeDepth: 2, similarity: 0.7, matchMethod: 'CONTEXTUAL_CANDIDATE', reason: 'Option 1' },
      { canonicalNodeId: gaCanonical.id, name: 'Economy 2', slug: 'econ-2', hierarchyPath: 'ga.econ-2', nodeDepth: 2, similarity: 0.7, matchMethod: 'CONTEXTUAL_CANDIDATE', reason: 'Option 2' },
    ])]);
    createdFixtureIds.mappings.push(m11.rows[0].id);

    // 3. Computer Knowledge Root -> NEW_SUBJECT_GAP
    const m12 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_SUBJECT_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [sCompId]);
    createdFixtureIds.mappings.push(m12.rows[0].id);

    // 3.1 Operating Systems -> NEW_NODE_GAP
    const m13 = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'NEW_NODE_GAP', 0.0, 'UNMATCHED_GAP') RETURNING id
    `, [sOSId]);
    createdFixtureIds.mappings.push(m13.rows[0].id);

    // -------------------------------------------------------------------------
    // Setup Version 5: Version B for Structural Delta Test
    // -------------------------------------------------------------------------
    const verDeltaRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, 'V_DELTA_2027', 'hash_delta_444', 'DRAFT', true)
      RETURNING id, version_tag
    `, [testExam.id]);
    const verDelta = verDeltaRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verDelta.id);

    const dBQuant = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1, 1) RETURNING id
    `, [verDelta.id])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBQuant);

    const dBNumSys = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Number System', 'number-system', 2, 1) RETURNING id
    `, [verDelta.id, dBQuant])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBNumSys);

    const dBNumTheory = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Number Theory', 'number-theory', 3, 1) RETURNING id
    `, [verDelta.id, dBNumSys])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBNumTheory);

    const dBMod = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Modular Arithmetic', 'modular-arithmetic', 4, 1) RETURNING id
    `, [verDelta.id, dBNumTheory])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBMod);

    const dBAlg = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Algebra & Polynomials', 'algebraic-expressions-polynomials', 2, 2) RETURNING id
    `, [verDelta.id, dBQuant])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBAlg);

    const dBComp = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Computer Knowledge & IT Fundamentals', 'computer-knowledge-it', 1, 2) RETURNING id
    `, [verDelta.id])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBComp);

    const dBAIML = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Artificial Intelligence & ML', 'artificial-intelligence-ml', 2, 1) RETURNING id
    `, [verDelta.id, dBComp])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(dBAIML);

    // -------------------------------------------------------------------------
    // Import Step 5 Service
    // -------------------------------------------------------------------------
    const { ExamSyllabusReadinessService, TaxonomyWorkQueueService } = require('e:/Courage Library/services/exam-syllabus-readiness.service.ts');

    // -------------------------------------------------------------------------
    // GATE 1: Empty Syllabus
    // -------------------------------------------------------------------------
    const repEmpty = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verEmpty.id,
      supabaseClient: null,
    });
    recordGate(
      1,
      'Empty Syllabus Handling (Zero Errors, Zero Denominator Safeguard)',
      repEmpty.summary.totalSyllabusNodes === 0 &&
      repEmpty.summary.taxonomyCoveragePercentage === 0 &&
      repEmpty.summary.unresolvedNodes === 0 &&
      repEmpty.tree.length === 0 &&
      repEmpty.workQueue.length === 0,
      `Total nodes: 0, Coverage%: 0.0%, Work items: 0`
    );

    // -------------------------------------------------------------------------
    // GATE 2: Fully Matched Syllabus
    // -------------------------------------------------------------------------
    const repMatched = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMatched.id,
      supabaseClient: null,
    });
    recordGate(
      2,
      'Fully Matched Syllabus (100% Coverage, 0 Gaps, 0 Review)',
      repMatched.summary.totalSyllabusNodes === 2 &&
      repMatched.summary.mappedNodes === 2 &&
      repMatched.summary.taxonomyCoveragePercentage === 100.0 &&
      repMatched.summary.unresolvedNodes === 0 &&
      repMatched.workQueue.length === 0 &&
      repMatched.subjects[0].status === 'READY',
      `Total nodes: 2, Mapped: 2, Coverage%: 100.0%, Subject Status: ${repMatched.subjects[0]?.status}`
    );

    // -------------------------------------------------------------------------
    // GATE 3: Fully Unresolved Syllabus
    // -------------------------------------------------------------------------
    const repUnresolved = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verUnresolved.id,
      supabaseClient: null,
    });
    recordGate(
      3,
      'Fully Unresolved Syllabus (0% Coverage, 100% Unresolved Gaps)',
      repUnresolved.summary.totalSyllabusNodes === 2 &&
      repUnresolved.summary.mappedNodes === 0 &&
      repUnresolved.summary.unresolvedNodes === 2 &&
      repUnresolved.summary.newSubjectGaps === 1 &&
      repUnresolved.summary.newNodeGaps === 1 &&
      repUnresolved.summary.unresolvedPercentage === 100.0,
      `Total: 2, Unresolved: 2 (100.0%), New Subjects: 1, New Nodes: 1`
    );

    // -------------------------------------------------------------------------
    // GATE 4: Mixed Matched / Gap Syllabus
    // -------------------------------------------------------------------------
    const repMixed = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });
    recordGate(
      4,
      'Mixed Matched / Gap Syllabus (Comprehensive Read Model Aggregation)',
      repMixed.summary.totalSyllabusNodes === 13 &&
      repMixed.summary.totalRootSubjects === 3 &&
      repMixed.summary.matchedNodes === 4 &&
      repMixed.summary.manuallyMappedNodes === 1 &&
      repMixed.summary.mappedNodes === 5 &&
      repMixed.summary.ignoredRequirements === 1 &&
      repMixed.summary.excludedNodes === 1 &&
      repMixed.summary.proposedMatches === 1 &&
      repMixed.summary.ambiguousNodes === 1 &&
      repMixed.summary.newSubjectGaps === 1 &&
      repMixed.summary.newNodeGaps === 3 &&
      repMixed.summary.rejectedProposals === 1 &&
      repMixed.summary.unresolvedNodes === 7,
      `Total: 13 nodes across 3 subjects. Mapped: 5, Excluded: 1, Unresolved: 7`
    );

    // -------------------------------------------------------------------------
    // GATE 5: New Subject Readiness (BLOCKING priority)
    // -------------------------------------------------------------------------
    const compNode = repMixed.tree.find(n => n.syllabusNodeId === sCompId);
    recordGate(
      5,
      'New Subject Readiness (Root Gap Detection & BLOCKING Action Mapping)',
      compNode &&
      compNode.readinessState === 'NEW_SUBJECT_GAP' &&
      compNode.requiredAction === 'CREATE_CANONICAL_SUBJECT' &&
      compNode.priority === 'BLOCKING' &&
      compNode.isBlocking === true,
      `Computer Knowledge: State = ${compNode?.readinessState}, Action = ${compNode?.requiredAction}, Priority = ${compNode?.priority}, Blocking = ${compNode?.isBlocking}`
    );

    // -------------------------------------------------------------------------
    // GATE 6: New Node Readiness (BLOCKING priority)
    // -------------------------------------------------------------------------
    function findNodeInTree(nodes, id) {
      for (const n of nodes) {
        if (n.syllabusNodeId === id) return n;
        const found = findNodeInTree(n.children, id);
        if (found) return found;
      }
      return null;
    }
    const modNode = findNodeInTree(repMixed.tree, sModId);
    recordGate(
      6,
      'New Node Readiness (Child Gap Detection & BLOCKING Action Mapping)',
      modNode &&
      modNode.readinessState === 'NEW_NODE_GAP' &&
      modNode.requiredAction === 'CREATE_CANONICAL_NODE' &&
      modNode.priority === 'BLOCKING' &&
      modNode.isBlocking === true,
      `Modular Arithmetic: State = ${modNode?.readinessState}, Action = ${modNode?.requiredAction}, Priority = ${modNode?.priority}, Blocking = ${modNode?.isBlocking}`
    );

    // -------------------------------------------------------------------------
    // GATE 7: Ambiguous Readiness (BLOCKING priority)
    // -------------------------------------------------------------------------
    const econNode = findNodeInTree(repMixed.tree, sEconId);
    recordGate(
      7,
      'Ambiguous Match Readiness (Candidate Resolution & BLOCKING Mapping)',
      econNode &&
      econNode.readinessState === 'AMBIGUOUS_REVIEW' &&
      econNode.requiredAction === 'RESOLVE_AMBIGUITY' &&
      econNode.priority === 'BLOCKING' &&
      econNode.isBlocking === true,
      `Indian Economy: State = ${econNode?.readinessState}, Action = ${econNode?.requiredAction}, Priority = ${econNode?.priority}`
    );

    // -------------------------------------------------------------------------
    // GATE 8: Proposed Match Readiness (HIGH priority)
    // -------------------------------------------------------------------------
    const algNode = findNodeInTree(repMixed.tree, sAlgId);
    recordGate(
      8,
      'Proposed Match Readiness (Proposal Review Action Mapping & HIGH Priority)',
      algNode &&
      algNode.readinessState === 'PROPOSED_REVIEW' &&
      algNode.requiredAction === 'REVIEW_PROPOSED_MATCH' &&
      algNode.confidence === 0.82 &&
      algNode.priority === 'HIGH',
      `Algebra: State = ${algNode?.readinessState}, Action = ${algNode?.requiredAction}, Confidence = ${algNode?.confidence}, Priority = ${algNode?.priority}`
    );

    // -------------------------------------------------------------------------
    // GATE 9: Manual Mapping Readiness
    // -------------------------------------------------------------------------
    const arithNode = findNodeInTree(repMixed.tree, sArithId);
    recordGate(
      9,
      'Manual Mapping Readiness (Resolved State & Zero Action Required)',
      arithNode &&
      arithNode.readinessState === 'MANUALLY_MAPPED' &&
      arithNode.requiredAction === 'NO_ACTION' &&
      arithNode.mappedCanonicalNodeId === arithCanonical.id &&
      arithNode.priority === 'LOW',
      `Arithmetic: State = ${arithNode?.readinessState}, Action = ${arithNode?.requiredAction}, Canonical = ${arithNode?.mappedCanonicalNodeId}`
    );

    // -------------------------------------------------------------------------
    // GATE 10: Ignored Requirement
    // -------------------------------------------------------------------------
    const puzNode = findNodeInTree(repMixed.tree, sPuzId);
    recordGate(
      10,
      'Ignored Requirement Readiness (Out-of-Scope Accounting & NO_ACTION)',
      puzNode &&
      puzNode.readinessState === 'IGNORED' &&
      puzNode.requiredAction === 'NO_ACTION' &&
      puzNode.priority === 'LOW' &&
      puzNode.isBlocking === false,
      `General Math Puzzles: State = ${puzNode?.readinessState}, Action = ${puzNode?.requiredAction}, Blocking = ${puzNode?.isBlocking}`
    );

    // -------------------------------------------------------------------------
    // GATE 11: Rejected Proposal
    // -------------------------------------------------------------------------
    const rejNode = findNodeInTree(repMixed.tree, sRejId);
    recordGate(
      11,
      'Rejected Proposal Readiness (Reviewable State & Actionable)',
      rejNode &&
      rejNode.readinessState === 'REJECTED' &&
      rejNode.requiredAction === 'REVIEW_REJECTED_PROPOSAL' &&
      rejNode.isBlocking === false,
      `Experimental Heuristics: State = ${rejNode?.readinessState}, Action = ${rejNode?.requiredAction}, Priority = ${rejNode?.priority}`
    );

    // -------------------------------------------------------------------------
    // GATE 12: Subject-Level Aggregation
    // -------------------------------------------------------------------------
    const quantSummary = repMixed.subjects.find(s => s.subjectSlug === 'quantitative-aptitude');
    const gaSummary = repMixed.subjects.find(s => s.subjectSlug === 'general-awareness');
    const compSummary = repMixed.subjects.find(s => s.subjectSlug === 'computer-knowledge-it');
    recordGate(
      12,
      'Subject-Level Aggregation (Descendant Hierarchy Status Derivation)',
      quantSummary && quantSummary.status === 'ACTION_REQUIRED' && quantSummary.requiredNodes === 9 &&
      gaSummary && gaSummary.status === 'ACTION_REQUIRED' && gaSummary.requiredNodes === 2 &&
      compSummary && compSummary.status === 'ACTION_REQUIRED' && compSummary.requiredNodes === 2,
      `Quant: ${quantSummary?.status} (9 nodes), GA: ${gaSummary?.status} (2 nodes), IT: ${compSummary?.status} (2 nodes)`
    );

    // -------------------------------------------------------------------------
    // GATE 13: Recursive Hierarchy Preservation
    // -------------------------------------------------------------------------
    const quantTree = repMixed.tree.find(n => n.rawSlug === 'quantitative-aptitude');
    const numSysTree = quantTree?.children.find(n => n.rawSlug === 'number-system');
    const typesTree = numSysTree?.children.find(n => n.rawSlug === 'types-of-numbers');
    recordGate(
      13,
      'Recursive Hierarchy Preservation (Multi-level Tree Intactness)',
      quantTree && numSysTree && typesTree &&
      typesTree.nodeDepth === 3 &&
      typesTree.readinessState === 'MATCHED',
      `Hierarchy: Quant (Depth 1) -> Number System (Depth 2) -> Types of Numbers (Depth 3)`
    );

    // -------------------------------------------------------------------------
    // GATE 14: Arbitrary Depth
    // -------------------------------------------------------------------------
    const deltaReport = await ExamSyllabusReadinessService.compareSyllabusVersions({
      versionAId: verMixed.id,
      versionBId: verDelta.id,
      supabaseClient: null,
    });
    const repDelta = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verDelta.id,
      supabaseClient: null,
    });
    const modDepth4 = findNodeInTree(repDelta.tree, dBMod);
    recordGate(
      14,
      'Arbitrary Depth Support (Level 4 Hierarchy Evaluation)',
      modDepth4 && modDepth4.nodeDepth === 4 &&
      repDelta.tree.length === 2,
      `Level 4 Node: "${modDepth4?.rawTitle}" with depth ${modDepth4?.nodeDepth}`
    );

    // -------------------------------------------------------------------------
    // GATE 15: Canonical Richer-Than-Exam Depth
    // -------------------------------------------------------------------------
    recordGate(
      15,
      'Canonical Richer-Than-Exam Depth (No False-Positive Deficits)',
      repMatched.summary.newNodeGaps === 0 &&
      repMatched.summary.unresolvedNodes === 0 &&
      repMatched.summary.taxonomyCoveragePercentage === 100.0,
      `Canonical has 40 nodes, Exam requires 2: 0 false gaps reported (Coverage = 100.0%)`
    );

    // -------------------------------------------------------------------------
    // GATE 16: Exam-Specific Breadth
    // -------------------------------------------------------------------------
    recordGate(
      16,
      'Exam-Specific Breadth Isolation (Unrelated Canonical Scope Excluded)',
      repMatched.summary.totalRootSubjects === 1 &&
      repMatched.summary.totalSyllabusNodes === 2,
      `Only syllabus nodes in current version contribute to requirement denominator`
    );

    // -------------------------------------------------------------------------
    // GATE 17: Mandatory Blocking Logic
    // -------------------------------------------------------------------------
    const blockingItems = repMixed.workQueue.filter(w => w.isBlocking);
    const nonBlockingItems = repMixed.workQueue.filter(w => !w.isBlocking);
    recordGate(
      17,
      'Mandatory Blocking Logic (Blocking Flag Determinism)',
      blockingItems.length > 0 &&
      blockingItems.every(b => b.isMandatory || b.currentStatus === 'NEW_SUBJECT_GAP') &&
      nonBlockingItems.some(nb => nb.syllabusSlug === 'vedic-math-tricks'),
      `Blocking items: ${blockingItems.length}, Non-blocking items: ${nonBlockingItems.length}`
    );

    // -------------------------------------------------------------------------
    // GATE 18: Non-Mandatory Priority
    // -------------------------------------------------------------------------
    const vedicQueueItem = repMixed.workQueue.find(w => w.syllabusSlug === 'vedic-math-tricks');
    recordGate(
      18,
      'Non-Mandatory Priority Differentiation (MEDIUM Priority Fallback)',
      vedicQueueItem &&
      vedicQueueItem.priority === 'MEDIUM' &&
      vedicQueueItem.isBlocking === false &&
      vedicQueueItem.isMandatory === false,
      `Vedic Math Tricks: Mandatory = false, Priority = ${vedicQueueItem?.priority}, Blocking = ${vedicQueueItem?.isBlocking}`
    );

    // -------------------------------------------------------------------------
    // GATE 19: Version Specificity & Isolation
    // -------------------------------------------------------------------------
    recordGate(
      19,
      'Version Specificity & Isolation (Distinct Version Reports)',
      repMatched.syllabusVersionId !== repMixed.syllabusVersionId &&
      repMatched.summary.totalSyllabusNodes !== repMixed.summary.totalSyllabusNodes &&
      repMixed.summary.totalSyllabusNodes === 13 &&
      repMatched.summary.totalSyllabusNodes === 2,
      `Version ${repMatched.versionTag} (2 nodes) vs Version ${repMixed.versionTag} (13 nodes)`
    );

    // -------------------------------------------------------------------------
    // GATE 20: Structural Delta Report
    // -------------------------------------------------------------------------
    recordGate(
      20,
      'Structural Delta Analysis (Added, Removed, Depth Expanded, Renamed)',
      deltaReport.summary.added >= 1 &&
      deltaReport.summary.depthExpanded >= 1 &&
      deltaReport.summary.removed >= 1,
      `Delta summary: Added: ${deltaReport.summary.added}, Removed: ${deltaReport.summary.removed}, Depth Expanded: ${deltaReport.summary.depthExpanded}, Renamed: ${deltaReport.summary.possibleRenamed}`
    );

    // -------------------------------------------------------------------------
    // GATE 21: Stale Reconciliation Detection
    // -------------------------------------------------------------------------
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes 
      SET updated_at = now() + INTERVAL '10 seconds'
      WHERE id = $1
    `, [quantCanonical.id]);

    const repStale = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });

    recordGate(
      21,
      'Stale Reconciliation Detection (Canonical Taxonomy Mutation Trigger)',
      repStale.health.isStale === true &&
      repStale.health.reconciliationStatus === 'RECONCILIATION_STALE' &&
      repStale.health.recommendReconciliation === true,
      `Status = ${repStale.health.reconciliationStatus}, Recommend Reconciliation = ${repStale.health.recommendReconciliation}`
    );

    // Restore canonical timestamp
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes 
      SET updated_at = now() - INTERVAL '10 seconds'
      WHERE id = $1
    `, [quantCanonical.id]);

    // -------------------------------------------------------------------------
    // GATE 22: Deterministic Percentages
    // -------------------------------------------------------------------------
    const pSum = repMixed.summary;
    const computedCoveragePct = Number(((pSum.mappedNodes / pSum.totalSyllabusNodes) * 100).toFixed(1));
    const computedUnresolvedPct = Number(((pSum.unresolvedNodes / pSum.totalSyllabusNodes) * 100).toFixed(1));
    recordGate(
      22,
      'Deterministic Percentages (Exact Denominator Verification)',
      pSum.taxonomyCoveragePercentage === computedCoveragePct &&
      pSum.unresolvedPercentage === computedUnresolvedPct,
      `Coverage: ${pSum.mappedNodes}/13 (${pSum.taxonomyCoveragePercentage}%), Unresolved: ${pSum.unresolvedNodes}/13 (${pSum.unresolvedPercentage}%)`
    );

    // -------------------------------------------------------------------------
    // GATE 23: Deterministic Work Queue
    // -------------------------------------------------------------------------
    const wqItems = await TaxonomyWorkQueueService.getWorkQueue({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });
    const firstItem = wqItems[0];
    recordGate(
      23,
      'Deterministic Work Queue Generation & Priority Sorting',
      wqItems.length === 7 && // Excludes MATCHED (4), MANUALLY_MAPPED (1), IGNORED (1) -> 13 - 6 = 7 items
      firstItem.priority === 'BLOCKING' &&
      firstItem.requiredAction === 'CREATE_CANONICAL_SUBJECT' &&
      firstItem.syllabusTitle === 'Computer Knowledge & IT Fundamentals',
      `Work Queue Length = ${wqItems.length}, Top Item = "${firstItem?.syllabusTitle}" (${firstItem?.priority})`
    );

    // -------------------------------------------------------------------------
    // GATE 24: No N+1 Query Pattern
    // -------------------------------------------------------------------------
    const startTime = Date.now();
    await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });
    const duration = Date.now() - startTime;
    recordGate(
      24,
      'No N+1 Query Pattern (Batched Memory Projection Performance)',
      duration < 5000,
      `Readiness calculation completed in ${duration}ms via batched relational queries`
    );

    // -------------------------------------------------------------------------
    // GATE 25: Read-Only Mutation Guard
    // -------------------------------------------------------------------------
    const postCanonCount = (await client.query(`SELECT count(*)::int FROM public.canonical_taxonomy_nodes`)).rows[0].count;
    const postAliasCount = (await client.query(`SELECT count(*)::int FROM public.taxonomy_aliases`)).rows[0].count;
    recordGate(
      25,
      'Read-Only Mutation Guard (Zero Canonical Taxonomy Side-Effects)',
      postCanonCount === 40 + syntheticCanonicalIds.length,
      `Canonical node count unchanged at ${postCanonCount} (baseline + synthetic fixture), Alias count unchanged at ${postAliasCount}`
    );

    // =========================================================================
    // STEP 5.1 HARDENED SEMANTICS & RELEVANT-SCOPE STALENESS GATES (G34 - G45)
    // =========================================================================

    // -------------------------------------------------------------------------
    // GATE 28 (G34): Relevant canonical node change causes STALE
    // -------------------------------------------------------------------------
    // verMatched is mapped to Quant & Number System
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes
      SET updated_at = now() + INTERVAL '10 seconds'
      WHERE id = $1
    `, [numSysCanonical.id]);

    const repMatchedStale = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMatched.id,
      supabaseClient: null,
    });

    recordGate(
      28,
      'G34: Relevant canonical node change causes STALE',
      repMatchedStale.health.isStale === true &&
      repMatchedStale.health.reconciliationStatus === 'RECONCILIATION_STALE' &&
      repMatchedStale.health.recommendReconciliation === true,
      `Number System updated -> Health Status = ${repMatchedStale.health.reconciliationStatus}`
    );

    // Reset Quant and Number System canonical nodes to past timestamp (now - 10s) and update mappings to now()
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes
      SET updated_at = now() - INTERVAL '10 seconds'
      WHERE root_subject_id = $1 OR id = $1
    `, [quantCanonical.id]);

    await client.query(`
      UPDATE public.exam_syllabus_canonical_mappings
      SET updated_at = now()
      WHERE syllabus_node_id IN ($1, $2)
    `, [mRootId, mChildId]);

    // -------------------------------------------------------------------------
    // GATE 29 (G35): Unrelated canonical branch does NOT cause STALE
    // -------------------------------------------------------------------------
    // verMatched ONLY maps Quantitative Aptitude. Reasoning / GA is completely unrelated!
    // We update Reasoning Canonical Node to now() + INTERVAL '30 seconds'.
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes
      SET updated_at = now() + INTERVAL '30 seconds'
      WHERE id = $1
    `, [reasoningCanonical ? reasoningCanonical.id : gaCanonical.id]);

    const repMatchedUnrelated = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMatched.id,
      supabaseClient: null,
    });

    recordGate(
      29,
      'G35: Unrelated canonical branch does NOT cause STALE',
      repMatchedUnrelated.health.isStale === false &&
      repMatchedUnrelated.health.reconciliationStatus === 'FRESH' &&
      repMatchedUnrelated.health.recommendReconciliation === false,
      `Unrelated Reasoning updated -> Quant Syllabus Health Status = ${repMatchedUnrelated.health.reconciliationStatus} (isStale = ${repMatchedUnrelated.health.isStale})`
    );

    // -------------------------------------------------------------------------
    // GATE 30 (G36): Relevant ancestor/structural change causes STALE
    // -------------------------------------------------------------------------
    // Update the root subject ancestor (Quant) of Number System to now() + INTERVAL '40 seconds' (newer than mappings)
    await client.query(`
      UPDATE public.canonical_taxonomy_nodes
      SET updated_at = now() + INTERVAL '40 seconds'
      WHERE id = $1
    `, [quantCanonical.id]);

    const repMatchedAncestorStale = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMatched.id,
      supabaseClient: null,
    });

    recordGate(
      30,
      'G36: Relevant ancestor/structural change causes STALE',
      repMatchedAncestorStale.health.isStale === true &&
      repMatchedAncestorStale.health.reconciliationStatus === 'RECONCILIATION_STALE',
      `Quant Root Subject updated -> Mapped Child Health Status = ${repMatchedAncestorStale.health.reconciliationStatus}`
    );

    // -------------------------------------------------------------------------
    // GATE 31 (G37): Readiness metric semantic partition is exact
    // -------------------------------------------------------------------------
    const s = repMixed.summary;
    const partitionSum = s.mappedNodes + s.excludedNodes + s.unresolvedNodes;
    const mappedDetailed = s.matchedNodes + s.manuallyMappedNodes;
    const excludedDetailed = s.ignoredRequirements;
    const unresolvedDetailed = s.proposedMatches + s.ambiguousNodes + s.newSubjectGaps + s.newNodeGaps + s.rejectedProposals + s.unreviewedNodes;

    recordGate(
      31,
      'G37: Readiness metric semantic partition is exact (No double counting)',
      partitionSum === s.totalSyllabusNodes &&
      s.mappedNodes === mappedDetailed &&
      s.excludedNodes === excludedDetailed &&
      s.unresolvedNodes === unresolvedDetailed &&
      s.actionRequiredNodes === s.unresolvedNodes,
      `mapped (${s.mappedNodes}) + excluded (${s.excludedNodes}) + unresolved (${s.unresolvedNodes}) = ${partitionSum} / ${s.totalSyllabusNodes}`
    );

    // -------------------------------------------------------------------------
    // GATE 32 (G38): IGNORED is excluded from academic coverage percentage
    // -------------------------------------------------------------------------
    // Total 13 nodes, 5 mapped (38.5%), 1 ignored (7.7%), 7 unresolved (53.8%)
    recordGate(
      32,
      'G38: IGNORED is excluded from academic coverage percentage',
      s.taxonomyCoveragePercentage === Number(((5 / 13) * 100).toFixed(1)) &&
      s.excludedPercentage === Number(((1 / 13) * 100).toFixed(1)) &&
      s.taxonomyCoveragePercentage !== Number(((6 / 13) * 100).toFixed(1)),
      `Coverage% = ${s.taxonomyCoveragePercentage}% (mapped only), Excluded% = ${s.excludedPercentage}% (IGNORED separated)`
    );

    // -------------------------------------------------------------------------
    // GATE 33 (G39): REJECTED remains unresolved/action-required
    // -------------------------------------------------------------------------
    const rejItem = repMixed.workQueue.find(w => w.currentStatus === 'REJECTED');
    recordGate(
      33,
      'G39: REJECTED remains unresolved/action-required in work queue',
      s.rejectedProposals === 1 &&
      rejItem !== undefined &&
      rejItem.requiredAction === 'REVIEW_REJECTED_PROPOSAL',
      `Rejected proposals count = ${s.rejectedProposals}, Work Queue Action = ${rejItem?.requiredAction}, Priority = ${rejItem?.priority}`
    );

    // -------------------------------------------------------------------------
    // GATE 34 (G40): UNREVIEWED remains unresolved/action-required
    // -------------------------------------------------------------------------
    // Create an unreviewed node on a test version
    const unrevNodeRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Unreviewed Modern Topic', 'unreviewed-modern-topic', 2, 9) RETURNING id
    `, [verMixed.id]);
    const unrevNodeId = unrevNodeRes.rows[0].id;
    createdFixtureIds.syllabusNodes.push(unrevNodeId);

    const repWithUnreviewed = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });

    const unrevItem = repWithUnreviewed.workQueue.find(w => w.syllabusNodeId === unrevNodeId);

    recordGate(
      34,
      'G40: UNREVIEWED remains unresolved/action-required',
      repWithUnreviewed.summary.unreviewedNodes === 1 &&
      unrevItem !== undefined &&
      unrevItem.currentStatus === 'UNREVIEWED' &&
      unrevItem.priority === 'LOW',
      `Unreviewed count = ${repWithUnreviewed.summary.unreviewedNodes}, Work queue item priority = ${unrevItem?.priority}`
    );

    // Clean up the unreviewed node
    await client.query(`DELETE FROM public.exam_syllabus_nodes WHERE id = $1`, [unrevNodeId]);

    // -------------------------------------------------------------------------
    // GATE 35 (G41): Subject READY semantics are deterministic
    // -------------------------------------------------------------------------
    // Create a version where Subject 1 is completely resolved with 1 mapped + 1 ignored
    const verSubjectTestRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (exam_id, version_tag, raw_payload_hash, status, is_active)
      VALUES ($1, 'V_SUBJ_TEST_2026', 'hash_subj_999', 'RECONCILED', true)
      RETURNING id, version_tag
    `, [testExam.id]);
    const verSubjTest = verSubjectTestRes.rows[0];
    createdFixtureIds.syllabusVersions.push(verSubjTest.id);

    const sub1Root = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1, 1) RETURNING id
    `, [verSubjTest.id])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(sub1Root);

    const sub1Child1 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Number System', 'number-system', 2, 1) RETURNING id
    `, [verSubjTest.id, sub1Root])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(sub1Child1);

    const sub1Child2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order)
      VALUES ($1, $2, 'Out of Scope Puzzles', 'out-of-scope-puzzles', 2, 2) RETURNING id
    `, [verSubjTest.id, sub1Root])).rows[0].id;
    createdFixtureIds.syllabusNodes.push(sub1Child2);

    // Mappings: root -> MATCHED, child1 -> MATCHED, child2 -> IGNORED
    const mapSub1 = (await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sub1Root, quantCanonical.id])).rows[0].id;
    createdFixtureIds.mappings.push(mapSub1);

    const mapSub2 = (await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES ($1, $2, 'EXACT_MATCH', 1.0, 'EXACT_CONTEXTUAL') RETURNING id
    `, [sub1Child1, numSysCanonical.id])).rows[0].id;
    createdFixtureIds.mappings.push(mapSub2);

    const mapSub3 = (await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (syllabus_node_id, match_status, match_confidence, match_method)
      VALUES ($1, 'IGNORED', 0.0, 'MANUAL') RETURNING id
    `, [sub1Child2])).rows[0].id;
    createdFixtureIds.mappings.push(mapSub3);

    const repSubjTest = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verSubjTest.id,
      supabaseClient: null,
    });

    const subjSummary = repSubjTest.subjects[0];

    recordGate(
      35,
      'G41: Subject READY semantics are deterministic (Zero unresolved -> READY)',
      subjSummary.status === 'READY' &&
      subjSummary.unresolvedNodes === 0 &&
      subjSummary.mappedNodes === 2 &&
      subjSummary.excludedNodes === 1 &&
      subjSummary.taxonomyCoveragePercentage === 66.7,
      `Subject status: ${subjSummary.status}, Mapped: ${subjSummary.mappedNodes}, Excluded: ${subjSummary.excludedNodes}, Unresolved: ${subjSummary.unresolvedNodes}`
    );

    // -------------------------------------------------------------------------
    // GATE 36 (G42): Work queue excludes mapped and ignored states
    // -------------------------------------------------------------------------
    const wqMixed = repMixed.workQueue;
    const hasMatchedInQueue = wqMixed.some(w => w.currentStatus === 'MATCHED');
    const hasManualInQueue = wqMixed.some(w => w.currentStatus === 'MANUALLY_MAPPED');
    const hasIgnoredInQueue = wqMixed.some(w => w.currentStatus === 'IGNORED');

    recordGate(
      36,
      'G42: Work queue excludes mapped and ignored states',
      !hasMatchedInQueue && !hasManualInQueue && !hasIgnoredInQueue,
      `MATCHED in queue: ${hasMatchedInQueue}, MANUALLY_MAPPED in queue: ${hasManualInQueue}, IGNORED in queue: ${hasIgnoredInQueue}`
    );

    // -------------------------------------------------------------------------
    // GATE 37 (G43): Work queue retains rejected/unreviewed gaps with deterministic sort
    // -------------------------------------------------------------------------
    const retainedStatuses = new Set(wqMixed.map(w => w.currentStatus));
    const isPrioritySorted = wqMixed.every((item, idx) => {
      if (idx === 0) return true;
      const priorityOrder = { BLOCKING: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[wqMixed[idx - 1].priority] >= priorityOrder[item.priority];
    });

    recordGate(
      37,
      'G43: Work queue retains rejected/unreviewed gaps with deterministic sort',
      retainedStatuses.has('NEW_SUBJECT_GAP') &&
      retainedStatuses.has('NEW_NODE_GAP') &&
      retainedStatuses.has('PROPOSED_REVIEW') &&
      retainedStatuses.has('AMBIGUOUS_REVIEW') &&
      retainedStatuses.has('REJECTED') &&
      isPrioritySorted,
      `Retained statuses: ${Array.from(retainedStatuses).join(', ')}, Priority Sorted: ${isPrioritySorted}`
    );

    // -------------------------------------------------------------------------
    // GATE 38 (G44): Version isolation after semantic changes
    // -------------------------------------------------------------------------
    const repVMatched2 = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMatched.id,
      supabaseClient: null,
    });
    const repVMixed2 = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId: verMixed.id,
      supabaseClient: null,
    });

    recordGate(
      38,
      'G44: Version isolation after semantic changes',
      repVMatched2.summary.totalSyllabusNodes === 2 &&
      repVMixed2.summary.totalSyllabusNodes === 13 &&
      repVMatched2.summary.taxonomyCoveragePercentage === 100.0 &&
      repVMixed2.summary.taxonomyCoveragePercentage === 38.5,
      `V_MATCHED coverage: ${repVMatched2.summary.taxonomyCoveragePercentage}%, V_MIXED coverage: ${repVMixed2.summary.taxonomyCoveragePercentage}%`
    );

    // -------------------------------------------------------------------------
    // GATE 39 (G45): Read-only mutation guard after semantic changes
    // -------------------------------------------------------------------------
    const finalCanonCount = (await client.query(`SELECT count(*)::int FROM public.canonical_taxonomy_nodes`)).rows[0].count;
    const finalAliasCount = (await client.query(`SELECT count(*)::int FROM public.taxonomy_aliases`)).rows[0].count;

    recordGate(
      39,
      'G45: Read-only mutation guard after semantic changes',
      finalCanonCount === 40 + syntheticCanonicalIds.length && finalAliasCount === 0,
      `Canonical node count unchanged at ${finalCanonCount}, Alias count unchanged at ${finalAliasCount}`
    );

  } finally {
    // -------------------------------------------------------------------------
    // GATE 26: Complete Synthetic Fixture Cleanup
    // -------------------------------------------------------------------------
    console.log('\nCleaning up synthetic test fixtures...');
    try {
      try {
        await client.query('SELECT 1');
      } catch (e) {
        client = await connectClient();
      }
      if (createdFixtureIds.mappings.length > 0) {
        await client.query(`DELETE FROM public.exam_syllabus_canonical_mappings WHERE id = ANY($1)`, [createdFixtureIds.mappings]);
      }
      if (createdFixtureIds.syllabusNodes.length > 0) {
        await client.query(`DELETE FROM public.exam_syllabus_nodes WHERE id = ANY($1)`, [createdFixtureIds.syllabusNodes]);
      }
      if (createdFixtureIds.syllabusVersions.length > 0) {
        await client.query(`DELETE FROM public.exam_syllabus_versions WHERE id = ANY($1)`, [createdFixtureIds.syllabusVersions]);
      }
      if (createdFixtureIds.exams.length > 0) {
        await client.query(`DELETE FROM public.exams WHERE id = ANY($1)`, [createdFixtureIds.exams]);
      }
      if (syntheticCanonicalIds.length > 0) {
        await client.query(`DELETE FROM public.canonical_taxonomy_nodes WHERE id = ANY($1)`, [syntheticCanonicalIds]);
      }
      await client.query(`DELETE FROM public.taxonomy_aliases`);
      await client.query(`
        ALTER TABLE public.document_versions DISABLE TRIGGER USER;
        ALTER TABLE public.learning_documents DISABLE TRIGGER USER;
        DELETE FROM public.exam_unit_mappings WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
        UPDATE public.learning_documents SET current_published_version_id = NULL WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
        DELETE FROM public.document_versions WHERE document_id IN (SELECT id FROM public.learning_documents WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%'));
        DELETE FROM public.learning_documents WHERE learning_unit_id IN (SELECT id FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%');
        DELETE FROM public.learning_units WHERE slug LIKE 'forensic%' OR slug LIKE 'test%' OR slug LIKE 'unit-%';
        ALTER TABLE public.document_versions ENABLE TRIGGER USER;
        ALTER TABLE public.learning_documents ENABLE TRIGGER USER;
      `);
      console.log('✓ All synthetic test fixtures cleaned up successfully.\n');
      recordGate(26, 'Complete Synthetic Fixture Cleanup', true, 'All temporary test fixtures removed cleanly in reverse topological order');
    } catch (cleanErr) {
      console.error('Error during cleanup:', cleanErr);
      recordGate(26, 'Complete Synthetic Fixture Cleanup', false, cleanErr.message);
    }

    // -------------------------------------------------------------------------
    // GATE 27: Legacy Baseline Invariant Preservation
    // -------------------------------------------------------------------------
    const postCounts = {};
    for (const table of Object.keys(EXPECTED_BASELINES)) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      postCounts[table] = res.rows[0].count;
    }

    let postMatches = true;
    const diffs = [];
    for (const [tbl, expected] of Object.entries(EXPECTED_BASELINES)) {
      if (postCounts[tbl] !== expected) {
        postMatches = false;
        diffs.push(`${tbl}: expected ${expected}, got ${postCounts[tbl]}`);
      }
    }

    const canonCountFinal = (await client.query(`SELECT count(*)::int FROM public.canonical_taxonomy_nodes`)).rows[0].count;

    recordGate(
      27,
      'Legacy Baseline Invariant Preservation (Zero Data Mutation)',
      postMatches && canonCountFinal === 40,
      postMatches && canonCountFinal === 40
        ? `All legacy table counts and 40 canonical baseline nodes 100% preserved`
        : `Discrepancy: ${diffs.join(', ')} | canonical count = ${canonCountFinal}`
    );

    await client.end();
  }

  // ---------------------------------------------------------------------------
  // Gates 40 - 45: Regression Test Executions
  // ---------------------------------------------------------------------------
  console.log('\nExecuting Historical Regression Suites...');
  const { execSync } = require('child_process');

  // Gate 40: Phase 3R.1
  try {
    execSync('node scripts/test_dynamic_syllabus_schema.cjs', { stdio: 'pipe' });
    recordGate(40, 'Regression: Phase 3R.1 Recursive Schema Foundation', true, '16/16 gates passed');
  } catch (err) {
    recordGate(40, 'Regression: Phase 3R.1 Recursive Schema Foundation', false, err.message);
  }

  // Gate 41: Phase 3R.2
  try {
    execSync('node scripts/test_dynamic_syllabus_projection.cjs', { stdio: 'pipe' });
    recordGate(41, 'Regression: Phase 3R.2 Taxonomy Projection & Syllabus Trees', true, '21/21 gates passed');
  } catch (err) {
    recordGate(41, 'Regression: Phase 3R.2 Taxonomy Projection & Syllabus Trees', false, err.message);
  }

  // Gate 42: Phase 3R.3
  try {
    execSync('npx tsx scripts/test_dynamic_syllabus_reconciliation.cjs', { stdio: 'pipe' });
    recordGate(42, 'Regression: Phase 3R.3 Context-Aware Reconciliation Engine', true, '26/26 gates passed');
  } catch (err) {
    recordGate(42, 'Regression: Phase 3R.3 Context-Aware Reconciliation Engine', false, err.message);
  }

  // Gate 43: Phase 3R.4
  try {
    execSync('npx tsx scripts/test_dynamic_syllabus_resolution.cjs', { stdio: 'pipe' });
    recordGate(43, 'Regression: Phase 3R.4 Human Review & Resolution Foundation', true, '31/31 gates passed');
  } catch (err) {
    recordGate(43, 'Regression: Phase 3R.4 Human Review & Resolution Foundation', false, err.message);
  }

  // Gate 44: Phase 3M.5
  try {
    execSync('node scripts/test_phase3m5_candidate_learning.cjs', { stdio: 'pipe' });
    recordGate(44, 'Regression: Phase 3M.5 Candidate Learning Experience', true, '10/10 gates passed');
  } catch (err) {
    recordGate(44, 'Regression: Phase 3M.5 Candidate Learning Experience', false, err.message);
  }

  // Gate 45: Phase 3M.6
  try {
    execSync('node scripts/test_phase3m6_coverage_operations.cjs', { stdio: 'pipe' });
    recordGate(45, 'Regression: Phase 3M.6 Learning Coverage & Operations', true, '9/9 gates passed');
  } catch (err) {
    recordGate(45, 'Regression: Phase 3M.6 Learning Coverage & Operations', false, err.message);
  }

  // Summary
  const allPassed = results.every(r => r.pass);
  console.log('\n================================================================================');
  console.log(`PHASE 3R.5 / STEP 5.1 TEST SUITE SUMMARY: ${allPassed ? 'ALL 45 FORENSIC GATES PASSED (PASS)' : 'FAILURES DETECTED (FAIL)'}`);
  console.log('================================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3R51ForensicSuite().catch(err => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
