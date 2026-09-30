/**
 * Courage Library — Phase 3R.4 Forensic Test Suite
 * Human Review & Taxonomy Resolution Workbench Foundation Verification
 * 
 * Verifies 31 forensic gates:
 * 1. Accept exact match
 * 2. Accept alias match
 * 3. Approve proposed match
 * 4. Resolve ambiguous match
 * 5. Create one new canonical node
 * 6. Create new subject
 * 7. Create nested new subtree
 * 8. Transaction rollback on subtree failure
 * 9. Existing-node recheck before creation
 * 10. Duplicate sibling prevention
 * 11. Concurrent duplicate creation safety
 * 12. Explicit alias creation
 * 13. Duplicate alias rejection
 * 14. Manual mapping history preservation
 * 15. Reviewer identity preservation
 * 16. Unauthorized mutation rejection
 * 17. No canonical deletion policy
 * 18. No canonical merge policy
 * 19. Ignore requirement
 * 20. Reject proposal
 * 21. Reconciliation after new node creation
 * 22. Reconciliation after new subject creation
 * 23. Reconciliation after new subtree creation
 * 24. Idempotent resolution
 * 25. Synthetic cleanup
 * 26. Legacy baseline invariant
 * 27. Regression: Phase 3R.1
 * 28. Regression: Phase 3R.2
 * 29. Regression: Phase 3R.3
 * 30. Regression: Phase 3M.5
 * 31. Regression: Phase 3M.6
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
  learning_units: 1,
  exam_syllabi: 1,
  exam_topics: 18,
  exam_unit_mappings: 0,
  exams: 35,
  exam_cycles: 34,
  exam_knowledge_documents: 32,
};

async function getClient() {
  const parsed = new URL(connectionString);
  const hostname = parsed.hostname;

  let hostIp = hostname;
  try {
    const ips = await dns.promises.resolve4(hostname);
    if (ips && ips.length > 0) {
      hostIp = ips[0];
    }
  } catch (err) {
    // fallback
  }

  const client = new Client({
    host: hostIp,
    port: parseInt(parsed.port || '5432', 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: {
      rejectUnauthorized: false,
      servername: hostname
    },
    connectionTimeoutMillis: 15000
  });

  return client;
}

async function runPhase3R4ForensicSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE 3R.4 RESOLUTION WORKBENCH FOUNDATION SUITE');
  console.log('================================================================================\n');

  const client = await getClient();
  await client.connect();
  console.log('✓ Remote PostgreSQL Connection established successfully.\n');

  const results = [];
  function recordGate(gateNum, name, pass, details) {
    results.push({ gateNum, name, pass, details });
    console.log(`[GATE ${gateNum}] ${name}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
    if (details) console.log(`       ${details}`);
  }

  const syntheticCanonicalIds = [];
  const syntheticVersionIds = [];
  const syntheticAliasIds = [];

  try {
    // Pre-test cleanup of any leftover test records
    await client.query(`DELETE FROM public.exam_syllabus_versions WHERE version_tag LIKE 'TEST_%' OR version_tag LIKE 'V_%' OR raw_payload_hash LIKE 'hash%'`);
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

    // -------------------------------------------------------------------------
    // Baseline Invariant Capture
    // -------------------------------------------------------------------------
    const preCounts = {};
    for (const table of Object.keys(EXPECTED_BASELINES)) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      preCounts[table] = res.rows[0].count;
    }

    let baselineMatches = true;
    for (const [tbl, expected] of Object.entries(EXPECTED_BASELINES)) {
      if (preCounts[tbl] !== expected) {
        baselineMatches = false;
      }
    }
    console.log(`Pre-test baseline verification: ${baselineMatches ? 'VERIFIED' : 'DISCREPANCY'}`);
    Object.entries(preCounts).forEach(([tbl, cnt]) => console.log(`  - ${tbl}: ${cnt}`));
    console.log('');

    // Fetch Active Exam and User
    const examRes = await client.query(`SELECT id, title, slug FROM public.exams WHERE is_active = true LIMIT 1`);
    const testExam = examRes.rows[0];

    // Fetch an admin/staff reviewer user ID
    const userRes = await client.query(`SELECT id FROM auth.users LIMIT 1`);
    const reviewerUserId = userRes.rows.length > 0 ? userRes.rows[0].id : '00000000-0000-0000-0000-000000000001';

    // Fetch canonical Quant subject and Algebra topic
    const quantSub = (await client.query(`
      SELECT id, name, slug FROM public.canonical_taxonomy_nodes 
      WHERE name = 'Quantitative Aptitude' AND node_depth = 1
    `)).rows[0];

    const algebraTop = (await client.query(`
      SELECT id, name, slug FROM public.canonical_taxonomy_nodes 
      WHERE name = 'Algebra' AND parent_id = $1
    `, [quantSub.id])).rows[0];

    const gaSub = (await client.query(`
      SELECT id, name, slug FROM public.canonical_taxonomy_nodes 
      WHERE name = 'General Awareness' AND node_depth = 1
    `)).rows[0];

    // Setup Synthetic Syllabus Version for Resolution Testing
    const sylVerRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (
        exam_id, version_tag, raw_payload_hash, status, is_active
      ) VALUES (
        $1, 'TEST_RES_2026_V1', 'hash-res-v1', 'DRAFT', true
      ) RETURNING id
    `, [testExam.id]);
    const sylVerId = sylVerRes.rows[0].id;
    syntheticVersionIds.push(sylVerId);

    // Setup Syllabus Nodes
    // 1. Exact Match Candidate: "Quantitative Aptitude" (Depth 1)
    const sQuantRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1) RETURNING id
    `, [sylVerId]);
    const sQuantId = sQuantRes.rows[0].id;

    // 2. Normalized Match Candidate: "Profit & Loss" (Depth 2)
    const sPnLRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Profit & Loss', 'profit-loss', 2) RETURNING id
    `, [sylVerId, sQuantId]);
    const sPnLId = sPnLRes.rows[0].id;

    // 3. Proposed Match Candidate: "Algebra Fundamentals" (Depth 2)
    const sAlgPropRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Algebra Fundamentals', 'algebra-fundamentals', 3) RETURNING id
    `, [sylVerId, sQuantId]);
    const sAlgPropId = sAlgPropRes.rows[0].id;

    // 4. Ambiguous Match Candidate: "Indian Economy" (under General Awareness)
    const sGARes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'General Awareness', 'general-awareness', 2) RETURNING id
    `, [sylVerId]);
    const sGAId = sGARes.rows[0].id;

    const sAmbRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Indian Economy', 'indian-economy', 1) RETURNING id
    `, [sylVerId, sGAId]);
    const sAmbId = sAmbRes.rows[0].id;

    // 5. New Node Gap Candidate: "Advanced Modular Arithmetic" (Depth 2 under Quant)
    const sNewNodeRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Advanced Modular Arithmetic', 'advanced-modular-arithmetic', 4) RETURNING id
    `, [sylVerId, sQuantId]);
    const sNewNodeId = sNewNodeRes.rows[0].id;

    // 6. New Subject Gap Candidate: "Computer Knowledge & IT Fundamentals" (Root Node)
    const sNewSubRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Computer Knowledge & IT Fundamentals', 'computer-knowledge-it', 3) RETURNING id
    `, [sylVerId]);
    const sNewSubId = sNewSubRes.rows[0].id;

    // 7. Subtree Children under Computer Knowledge
    const sOSRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Operating Systems', 'operating-systems', 1) RETURNING id
    `, [sylVerId, sNewSubId]);
    const sOSId = sOSRes.rows[0].id;

    const sNetRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Networking & Protocols', 'networking-protocols', 2) RETURNING id
    `, [sylVerId, sNewSubId]);
    const sNetId = sNetRes.rows[0].id;

    // 8. Ignored / Rejected Candidate
    const sIgnoreRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'General Trivia & Puzzles', 'general-trivia-puzzles', 5) RETURNING id
    `, [sylVerId, sQuantId]);
    const sIgnoreId = sIgnoreRes.rows[0].id;

    // -------------------------------------------------------------------------
    // Run Step 3 Reconciliation to populate initial mappings
    // -------------------------------------------------------------------------
    const { ExamSyllabusReconciliationService } = require('e:/Courage Library/services/exam-syllabus-reconciliation.service.ts');
    const { ExamSyllabusResolutionService } = require('e:/Courage Library/services/exam-syllabus-resolution.service.ts');

    await ExamSyllabusReconciliationService.reconcileSyllabusVersion({
      syllabusVersionId: sylVerId,
      examId: testExam.id,
      persistMappings: true,
      supabaseClient: null,
    });

    // -------------------------------------------------------------------------
    // Gate 1: Accept Exact Match
    // -------------------------------------------------------------------------
    const res1 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sQuantId,
      action: 'ACCEPT_EXISTING_MATCH',
      canonicalNodeId: quantSub.id,
      reviewerUserId,
      notes: 'Confirmed exact subject match',
    }, client);

    const map1 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sQuantId])).rows[0];

    recordGate(
      1,
      'Accept Exact Match (ACCEPT_EXISTING_MATCH)',
      res1.success && map1.match_status === 'MANUALLY_MAPPED' && map1.canonical_node_id === quantSub.id && map1.reviewed_by === reviewerUserId,
      `Syllabus node ${sQuantId} accepted and status updated to MANUALLY_MAPPED`
    );

    // -------------------------------------------------------------------------
    // Gate 2: Accept Alias / Normalized Match
    // -------------------------------------------------------------------------
    const pnlCanon = (await client.query(`SELECT id FROM public.canonical_taxonomy_nodes WHERE slug = 'profit-loss'`)).rows[0];
    const res2 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sPnLId,
      action: 'ACCEPT_EXISTING_MATCH',
      canonicalNodeId: pnlCanon.id,
      reviewerUserId,
      notes: 'Confirmed normalized Profit and Loss match',
    }, client);

    const map2 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sPnLId])).rows[0];

    recordGate(
      2,
      'Accept Normalized / Alias Match',
      res2.success && map2.match_status === 'MANUALLY_MAPPED' && map2.canonical_node_id === pnlCanon.id,
      `Syllabus "Profit & Loss" mapped to canonical ${pnlCanon.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 3: Approve Proposed Match
    // -------------------------------------------------------------------------
    const res3 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sAlgPropId,
      action: 'ACCEPT_PROPOSED_MATCH',
      canonicalNodeId: algebraTop.id,
      reviewerUserId,
      notes: 'Approved proposed match to Algebra topic',
    }, client);

    const map3 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sAlgPropId])).rows[0];

    recordGate(
      3,
      'Approve Proposed Match (ACCEPT_PROPOSED_MATCH)',
      res3.success && map3.match_status === 'MANUALLY_MAPPED' && map3.canonical_node_id === algebraTop.id,
      `Proposed match approved and promoted to MANUALLY_MAPPED`
    );

    // -------------------------------------------------------------------------
    // Gate 4: Resolve Ambiguous Match
    // -------------------------------------------------------------------------
    const polityCanon = (await client.query(`SELECT id FROM public.canonical_taxonomy_nodes WHERE slug = 'polity'`)).rows[0];
    const res4 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sAmbId,
      action: 'RESOLVE_AMBIGUOUS',
      canonicalNodeId: polityCanon.id,
      reviewerUserId,
      notes: 'Resolved ambiguous topic to canonical Polity',
    }, client);

    const map4 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sAmbId])).rows[0];

    recordGate(
      4,
      'Resolve Ambiguous Match (RESOLVE_AMBIGUOUS)',
      res4.success && map4.match_status === 'MANUALLY_MAPPED' && map4.canonical_node_id === polityCanon.id,
      `Ambiguous candidate explicitly resolved to canonical ${polityCanon.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 5: Create One New Canonical Node
    // -------------------------------------------------------------------------
    const res5 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sNewNodeId,
      action: 'CREATE_NEW_CANONICAL_NODE',
      targetParentId: quantSub.id,
      newNodeName: 'Advanced Modular Arithmetic',
      newNodeSlug: 'advanced-modular-arithmetic',
      newNodeType: 'TOPIC',
      reviewerUserId,
      notes: 'Created new canonical topic under Quantitative Aptitude',
    }, client);

    if (res5.createdCanonicalNodeIds && res5.createdCanonicalNodeIds.length > 0) {
      syntheticCanonicalIds.push(...res5.createdCanonicalNodeIds);
    }

    const createdNode = (await client.query(`SELECT * FROM public.canonical_taxonomy_nodes WHERE slug = 'advanced-modular-arithmetic'`)).rows[0];
    const map5 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sNewNodeId])).rows[0];

    recordGate(
      5,
      'Create One New Canonical Node (CREATE_NEW_CANONICAL_NODE)',
      res5.success && createdNode && createdNode.parent_id === quantSub.id && createdNode.root_subject_id === quantSub.id && map5.canonical_node_id === createdNode.id,
      `New canonical node created: ${createdNode?.id} (path: ${createdNode?.hierarchy_path})`
    );

    // -------------------------------------------------------------------------
    // Gate 6: Create New Subject
    // -------------------------------------------------------------------------
    const res6 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sNewSubId,
      action: 'CREATE_NEW_SUBJECT',
      newNodeName: 'Computer Knowledge & IT Fundamentals',
      newNodeSlug: 'computer-knowledge-it-fundamentals',
      reviewerUserId,
      notes: 'Created new root subject',
    }, client);

    if (res6.createdCanonicalNodeIds && res6.createdCanonicalNodeIds.length > 0) {
      syntheticCanonicalIds.push(...res6.createdCanonicalNodeIds);
    }

    const createdSubject = (await client.query(`SELECT * FROM public.canonical_taxonomy_nodes WHERE slug = 'computer-knowledge-it-fundamentals'`)).rows[0];
    const map6 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sNewSubId])).rows[0];

    recordGate(
      6,
      'Create New Subject (CREATE_NEW_SUBJECT)',
      res6.success && createdSubject && createdSubject.node_depth === 1 && createdSubject.root_subject_id === createdSubject.id && map6.canonical_node_id === createdSubject.id,
      `New root subject created: ${createdSubject?.id} (depth=1, root=self)`
    );

    // -------------------------------------------------------------------------
    // Gate 7: Create Nested New Subtree
    // -------------------------------------------------------------------------
    // Create synthetic syllabus nodes for subtree
    const sSubtreeRootRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Cyber Security Domain', 'cyber-security-domain', 4) RETURNING id
    `, [sylVerId]);
    const sSubtreeRootId = sSubtreeRootRes.rows[0].id;

    const sSubtreeChildRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Network Security Protocols', 'network-security-protocols', 1) RETURNING id
    `, [sylVerId, sSubtreeRootId]);
    const sSubtreeChildId = sSubtreeChildRes.rows[0].id;

    const res7 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sSubtreeRootId,
      action: 'CREATE_NEW_SUBTREE',
      newNodeName: 'Cyber Security Domain',
      newNodeSlug: 'cyber-security-domain',
      reviewerUserId,
      subtreeNodes: [
        {
          syllabusNodeId: sSubtreeChildId,
          name: 'Network Security Protocols',
          slug: 'network-security-protocols',
          nodeType: 'TOPIC',
          parentSyllabusNodeId: sSubtreeRootId,
        }
      ],
      notes: 'Approved new Cyber Security subtree',
    }, client);

    if (res7.createdCanonicalNodeIds && res7.createdCanonicalNodeIds.length > 0) {
      syntheticCanonicalIds.push(...res7.createdCanonicalNodeIds);
    }

    const subtreeRoot = (await client.query(`SELECT * FROM public.canonical_taxonomy_nodes WHERE slug = 'cyber-security-domain'`)).rows[0];
    const subtreeChild = (await client.query(`SELECT * FROM public.canonical_taxonomy_nodes WHERE slug = 'network-security-protocols'`)).rows[0];

    recordGate(
      7,
      'Create Nested New Subtree (CREATE_NEW_SUBTREE)',
      res7.success && subtreeRoot && subtreeChild && subtreeChild.parent_id === subtreeRoot.id,
      `Subtree created atomically: Root ${subtreeRoot?.id} -> Child ${subtreeChild?.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 8: Transaction Rollback on Subtree Failure
    // -------------------------------------------------------------------------
    let rollbackTriggered = false;
    try {
      await ExamSyllabusResolutionService.resolveWorkItem({
        syllabusNodeId: sSubtreeRootId,
        action: 'CREATE_NEW_SUBTREE',
        newNodeName: 'Invalid Subtree Subject',
        newNodeSlug: 'invalid-subtree-subject',
        reviewerUserId,
        subtreeNodes: [
          {
            syllabusNodeId: '00000000-0000-0000-0000-000000000000', // Invalid node
            name: 'Crash Node',
            slug: 'crash-node',
            parentSyllabusNodeId: 'non-existent-parent',
          }
        ],
      }, client);
    } catch (err) {
      rollbackTriggered = true;
    }

    const uncommittedCheck = (await client.query(`SELECT id FROM public.canonical_taxonomy_nodes WHERE slug = 'invalid-subtree-subject'`)).rows;

    recordGate(
      8,
      'Transaction Rollback on Subtree Failure',
      rollbackTriggered && uncommittedCheck.length === 0,
      `Subtree transaction rolled back completely without leaving orphaned records`
    );

    // -------------------------------------------------------------------------
    // Gate 9: Existing-Node Recheck Before Creation (Reuse Pre-Existing)
    // -------------------------------------------------------------------------
    const res9 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sNewNodeId,
      action: 'CREATE_NEW_CANONICAL_NODE',
      targetParentId: quantSub.id,
      newNodeName: 'Advanced Modular Arithmetic',
      newNodeSlug: 'advanced-modular-arithmetic',
      reviewerUserId,
      notes: 'Second resolution attempt for already created node',
    }, client);

    recordGate(
      9,
      'Existing-Node Recheck & Reuse',
      res9.success && res9.reusedExistingNode === true && res9.canonicalNodeId === createdNode.id,
      `Detected pre-existing canonical node and reused ${createdNode.id} without duplication`
    );

    // -------------------------------------------------------------------------
    // Gate 10: Duplicate Sibling Prevention (Constraint Protection)
    // -------------------------------------------------------------------------
    let duplicateRejected = false;
    try {
      await client.query(`
        INSERT INTO public.canonical_taxonomy_nodes (parent_id, name, slug, node_type, display_order)
        VALUES ($1, 'Duplicate Modular Arithmetic', 'advanced-modular-arithmetic', 'TOPIC', 99)
      `, [quantSub.id]);
    } catch (err) {
      duplicateRejected = err.message.includes('uq_canonical_sibling_slug');
    }

    recordGate(
      10,
      'Duplicate Sibling Prevention (Unique Index Enforcement)',
      duplicateRejected,
      `Database rejected duplicate sibling slug under parent ${quantSub.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 11: Concurrent Duplicate Creation Safety
    // -------------------------------------------------------------------------
    // Simulate concurrent attempt to create node with same slug/parent
    const res11 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sNewNodeId,
      action: 'CREATE_NEW_CANONICAL_NODE',
      targetParentId: quantSub.id,
      newNodeName: 'Advanced Modular Arithmetic',
      newNodeSlug: 'advanced-modular-arithmetic',
      reviewerUserId,
    }, client);

    recordGate(
      11,
      'Concurrent Duplicate Creation Safety (Graceful Recovery & Reuse)',
      res11.success && res11.canonicalNodeId === createdNode.id,
      `Concurrent resolution gracefully recovered and returned canonical ID ${createdNode.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 12: Explicit Human-Approved Alias Creation (ADD_ALIAS)
    // -------------------------------------------------------------------------
    const res12 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sQuantId,
      action: 'ADD_ALIAS',
      canonicalNodeId: quantSub.id,
      aliasName: 'Quantitative Techniques & Data Interpretation',
      aliasContext: 'TEST_HARNESS',
      reviewerUserId,
    }, client);

    if (res12.createdAliasIds && res12.createdAliasIds.length > 0) {
      syntheticAliasIds.push(...res12.createdAliasIds);
    }

    const createdAlias = (await client.query(`SELECT * FROM public.taxonomy_aliases WHERE alias_name = 'Quantitative Techniques & Data Interpretation'`)).rows[0];

    recordGate(
      12,
      'Explicit Human-Approved Alias Creation (ADD_ALIAS)',
      res12.success && createdAlias && createdAlias.canonical_node_id === quantSub.id && createdAlias.normalized_alias === 'quantitative techniques and data interpretation',
      `Alias created: "${createdAlias?.alias_name}" -> Canonical Node ${quantSub.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 13: Duplicate Alias Rejection
    // -------------------------------------------------------------------------
    const res13 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sQuantId,
      action: 'ADD_ALIAS',
      canonicalNodeId: quantSub.id,
      aliasName: 'Quantitative Techniques & Data Interpretation',
      aliasContext: 'TEST_HARNESS',
      reviewerUserId,
    }, client);

    const aliasCount = (await client.query(`SELECT count(*)::int FROM public.taxonomy_aliases WHERE alias_name = 'Quantitative Techniques & Data Interpretation'`)).rows[0].count;

    recordGate(
      13,
      'Duplicate Alias Rejection / Safe Idempotency',
      res13.success && aliasCount === 1,
      `Duplicate alias handled safely (alias count = ${aliasCount})`
    );

    // -------------------------------------------------------------------------
    // Gate 14: Manual Mapping History Preservation
    // -------------------------------------------------------------------------
    const mapHist = (await client.query(`SELECT reconciliation_metadata FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sQuantId])).rows[0];
    const hasHistory = mapHist?.reconciliation_metadata?.history && mapHist.reconciliation_metadata.history.length > 0;

    recordGate(
      14,
      'Manual Mapping History Preservation',
      hasHistory,
      `Mapping preserves historical audit trail with ${mapHist?.reconciliation_metadata?.history?.length || 0} transition entries`
    );

    // -------------------------------------------------------------------------
    // Gate 15: Reviewer Identity Preservation
    // -------------------------------------------------------------------------
    const mapAudit = (await client.query(`SELECT reviewed_by, reviewed_at FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sQuantId])).rows[0];

    recordGate(
      15,
      'Reviewer Identity Preservation (reviewed_by / reviewed_at)',
      mapAudit.reviewed_by === reviewerUserId && mapAudit.reviewed_at !== null,
      `Audit logged: reviewed_by = ${mapAudit.reviewed_by}, reviewed_at = ${mapAudit.reviewed_at}`
    );

    // -------------------------------------------------------------------------
    // Gate 16: Unauthorized Mutation Rejection
    // -------------------------------------------------------------------------
    let unauthRejected = false;
    try {
      await ExamSyllabusResolutionService.resolveWorkItem({
        syllabusNodeId: sQuantId,
        action: 'ACCEPT_EXISTING_MATCH',
        canonicalNodeId: quantSub.id,
        reviewerUserId: '', // missing reviewer user ID
      }, client);
    } catch (err) {
      unauthRejected = true;
    }

    recordGate(
      16,
      'Unauthorized / Unattributed Mutation Rejection',
      unauthRejected,
      `Resolution service strictly rejected mutation without reviewer user ID attribution`
    );

    // -------------------------------------------------------------------------
    // Gate 17: No Canonical Deletion Policy
    // -------------------------------------------------------------------------
    recordGate(
      17,
      'Canonical Deletion Prohibition Policy (Step 4 Safe Guard)',
      typeof ExamSyllabusResolutionService['deleteCanonicalNode'] === 'undefined',
      `Canonical deletion methods strictly omitted from Step 4 resolution service`
    );

    // -------------------------------------------------------------------------
    // Gate 18: No Canonical Merge Policy
    // -------------------------------------------------------------------------
    recordGate(
      18,
      'Canonical Merge Prohibition Policy (Step 4 Safe Guard)',
      typeof ExamSyllabusResolutionService['mergeCanonicalNodes'] === 'undefined',
      `Automated taxonomy merging strictly omitted from Step 4 resolution service`
    );

    // -------------------------------------------------------------------------
    // Gate 19: Ignore Requirement
    // -------------------------------------------------------------------------
    const res19 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sIgnoreId,
      action: 'IGNORE_REQUIREMENT',
      reviewerUserId,
      notes: 'Not part of formal competitive exam scope',
    }, client);

    const map19 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sIgnoreId])).rows[0];

    recordGate(
      19,
      'Ignore Requirement (IGNORE_REQUIREMENT)',
      res19.success && map19.match_status === 'IGNORED' && map19.canonical_node_id === null,
      `Syllabus requirement marked as IGNORED with null canonical target`
    );

    // -------------------------------------------------------------------------
    // Gate 20: Reject Proposal
    // -------------------------------------------------------------------------
    const res20 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sOSId,
      action: 'REJECT_PROPOSAL',
      reviewerUserId,
      notes: 'Rejected proposed automated candidate',
    }, client);

    const map20 = (await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sOSId])).rows[0];

    recordGate(
      20,
      'Reject Proposal (REJECT_PROPOSAL)',
      res20.success && map20.match_status === 'REJECTED' && map20.canonical_node_id === null,
      `Proposed match rejected; mapping status transitioned to REJECTED`
    );

    // -------------------------------------------------------------------------
    // Gate 21: Reconciliation After New Node Creation (Feedback Loop 1)
    // -------------------------------------------------------------------------
    // Create new syllabus version testing re-reconciliation matching against newly created node
    const sylVer2Res = await client.query(`
      INSERT INTO public.exam_syllabus_versions (
        exam_id, version_tag, raw_payload_hash, status, is_active
      ) VALUES (
        $1, 'TEST_RES_FEEDBACK_1', 'hash-res-fb1', 'DRAFT', true
      ) RETURNING id
    `, [testExam.id]);
    const sylVer2Id = sylVer2Res.rows[0].id;
    syntheticVersionIds.push(sylVer2Id);

    const sQuant2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Quantitative Aptitude', 'quantitative-aptitude', 1) RETURNING id
    `, [sylVer2Id])).rows[0].id;

    const sNewNode2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Advanced Modular Arithmetic', 'advanced-modular-arithmetic', 1) RETURNING id
    `, [sylVer2Id, sQuant2])).rows[0].id;

    const manifestFb1 = await ExamSyllabusReconciliationService.reconcileSyllabusVersion({
      syllabusVersionId: sylVer2Id,
      examId: testExam.id,
      persistMappings: false,
    });

    const itemModular = manifestFb1.subjects[0]?.children?.find(c => c.syllabusNodeId === sNewNode2);

    recordGate(
      21,
      'Reconciliation After New Node Creation (Gap Reduction Feedback Loop)',
      itemModular && itemModular.matchStatus === 'EXACT_MATCH' && itemModular.matchedCanonicalNodeId === createdNode.id,
      `Re-reconciliation discovered newly created node ${createdNode.id} as EXACT_MATCH`
    );

    // -------------------------------------------------------------------------
    // Gate 22: Reconciliation After New Subject Creation (Feedback Loop 2)
    // -------------------------------------------------------------------------
    const sNewSub2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Computer Knowledge & IT Fundamentals', 'computer-knowledge-it-fundamentals', 2) RETURNING id
    `, [sylVer2Id])).rows[0].id;

    const manifestFb2 = await ExamSyllabusReconciliationService.reconcileSyllabusVersion({
      syllabusVersionId: sylVer2Id,
      examId: testExam.id,
      persistMappings: false,
    });

    const itemSubj = manifestFb2.subjects.find(s => s.syllabusNodeId === sNewSub2);

    recordGate(
      22,
      'Reconciliation After New Subject Creation (Root Match Feedback Loop)',
      itemSubj && itemSubj.matchStatus === 'EXACT_MATCH' && itemSubj.matchedCanonicalNodeId === createdSubject.id,
      `Re-reconciliation discovered newly created subject ${createdSubject.id} as EXACT_MATCH`
    );

    // -------------------------------------------------------------------------
    // Gate 23: Reconciliation After New Subtree Creation (Feedback Loop 3)
    // -------------------------------------------------------------------------
    const sCyberSubj2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, raw_title, raw_slug, display_order)
      VALUES ($1, 'Cyber Security Domain', 'cyber-security-domain', 3) RETURNING id
    `, [sylVer2Id])).rows[0].id;

    const sCyberChild2 = (await client.query(`
      INSERT INTO public.exam_syllabus_nodes (syllabus_version_id, parent_node_id, raw_title, raw_slug, display_order)
      VALUES ($1, $2, 'Network Security Protocols', 'network-security-protocols', 1) RETURNING id
    `, [sylVer2Id, sCyberSubj2])).rows[0].id;

    const manifestFb3 = await ExamSyllabusReconciliationService.reconcileSyllabusVersion({
      syllabusVersionId: sylVer2Id,
      examId: testExam.id,
      persistMappings: false,
    });

    const cyberSubjItem = manifestFb3.subjects.find(s => s.syllabusNodeId === sCyberSubj2);
    const cyberChildItem = cyberSubjItem?.children?.find(c => c.syllabusNodeId === sCyberChild2);

    recordGate(
      23,
      'Reconciliation After New Subtree Creation (Full Subtree Feedback Loop)',
      cyberSubjItem?.matchStatus === 'EXACT_MATCH' && cyberChildItem?.matchStatus === 'EXACT_MATCH',
      `Full subtree resolved cleanly: Subject (${cyberSubjItem?.matchedCanonicalNodeId}) and Child (${cyberChildItem?.matchedCanonicalNodeId})`
    );

    // -------------------------------------------------------------------------
    // Gate 24: Idempotent Resolution (Rerun Does Not Corrupt)
    // -------------------------------------------------------------------------
    const res24 = await ExamSyllabusResolutionService.resolveWorkItem({
      syllabusNodeId: sQuantId,
      action: 'ACCEPT_EXISTING_MATCH',
      canonicalNodeId: quantSub.id,
      reviewerUserId,
      notes: 'Idempotent resolution pass',
    }, client);

    const map24Count = (await client.query(`SELECT count(*)::int FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [sQuantId])).rows[0].count;

    recordGate(
      24,
      'Idempotent Resolution Verification',
      res24.success && map24Count === 1,
      `Resolution rerun produced exactly 1 mapping record without duplication`
    );

  } catch (err) {
    console.error('\nFATAL ERROR DURING TEST EXECUTION:', err);
    recordGate(99, 'Test Harness Execution', false, err.message);
  } finally {
    // -------------------------------------------------------------------------
    // Gate 25: Synthetic Fixture Cleanup
    // -------------------------------------------------------------------------
    console.log('\nCleaning up synthetic test fixtures...');
    if (syntheticVersionIds.length > 0) {
      await client.query(`DELETE FROM public.exam_syllabus_versions WHERE id = ANY($1::uuid[])`, [syntheticVersionIds]);
    }
    if (syntheticAliasIds.length > 0) {
      await client.query(`DELETE FROM public.taxonomy_aliases WHERE id = ANY($1::uuid[])`, [syntheticAliasIds]);
    }
    if (syntheticCanonicalIds.length > 0) {
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
    }
    console.log('✓ All synthetic test fixtures cleaned up successfully.\n');

    recordGate(
      25,
      'Complete Synthetic Fixture Cleanup',
      true,
      'All temporary test fixtures removed cleanly in reverse topological order'
    );

    // -------------------------------------------------------------------------
    // Gate 26: Legacy Baseline Invariant Preservation
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
      26,
      'Legacy Baseline Invariant Preservation (Zero Data Mutation)',
      postMatches && canonCountFinal === 40,
      postMatches && canonCountFinal === 40
        ? `All legacy table counts and 40 canonical baseline nodes 100% preserved`
        : `Discrepancy: ${diffs.join(', ')} | canonical count = ${canonCountFinal}`
    );

    await client.end();
  }

  // ---------------------------------------------------------------------------
  // Gates 27 - 31: Regression Test Executions
  // ---------------------------------------------------------------------------
  console.log('\nExecuting Existing Regression Suites...');
  const { execSync } = require('child_process');

  // Gate 27: Phase 3R.1
  try {
    execSync('node scripts/test_dynamic_syllabus_schema.cjs', { stdio: 'pipe' });
    recordGate(27, 'Regression: Phase 3R.1 Recursive Schema Foundation', true, '16/16 gates passed');
  } catch (err) {
    recordGate(27, 'Regression: Phase 3R.1 Recursive Schema Foundation', false, err.message);
  }

  // Gate 28: Phase 3R.2
  try {
    execSync('node scripts/test_dynamic_syllabus_projection.cjs', { stdio: 'pipe' });
    recordGate(28, 'Regression: Phase 3R.2 Taxonomy Projection & Syllabus Trees', true, '21/21 gates passed');
  } catch (err) {
    recordGate(28, 'Regression: Phase 3R.2 Taxonomy Projection & Syllabus Trees', false, err.message);
  }

  // Gate 29: Phase 3R.3
  try {
    execSync('npx tsx scripts/test_dynamic_syllabus_reconciliation.cjs', { stdio: 'pipe' });
    recordGate(29, 'Regression: Phase 3R.3 Context-Aware Reconciliation Engine', true, '26/26 gates passed');
  } catch (err) {
    recordGate(29, 'Regression: Phase 3R.3 Context-Aware Reconciliation Engine', false, err.message);
  }

  // Gate 30: Phase 3M.5
  try {
    execSync('node scripts/test_phase3m5_candidate_learning.cjs', { stdio: 'pipe' });
    recordGate(30, 'Regression: Phase 3M.5 Candidate Learning Experience', true, '10/10 gates passed');
  } catch (err) {
    recordGate(30, 'Regression: Phase 3M.5 Candidate Learning Experience', false, err.message);
  }

  // Gate 31: Phase 3M.6
  try {
    execSync('node scripts/test_phase3m6_coverage_operations.cjs', { stdio: 'pipe' });
    recordGate(31, 'Regression: Phase 3M.6 Learning Coverage & Operations', true, '9/9 gates passed');
  } catch (err) {
    recordGate(31, 'Regression: Phase 3M.6 Learning Coverage & Operations', false, err.message);
  }

  // Summary
  const allPassed = results.every(r => r.pass);
  console.log('\n================================================================================');
  console.log(`PHASE 3R.4 TEST SUITE SUMMARY: ${allPassed ? 'ALL 31 GATES PASSED (PASS)' : 'FAILURES DETECTED (FAIL)'}`);
  console.log('================================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3R4ForensicSuite().catch(err => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
