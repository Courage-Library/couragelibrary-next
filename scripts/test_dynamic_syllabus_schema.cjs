/**
 * Courage Library — Phase 3R.1 Forensic Test Suite
 * Dynamic Exam Syllabus Reconciliation — Schema & Recursive Hierarchy Foundation
 * 
 * Verifies:
 * 1. Root canonical taxonomy node creation (Depth 1, SUBJECT)
 * 2. Child canonical taxonomy node creation (Depth 2, DOMAIN/TOPIC)
 * 3. 3-level canonical hierarchy creation (Depth 3, SUBTOPIC)
 * 4. 5-level canonical hierarchy creation (Depth 5, CONCEPT/METHOD)
 * 5. Arbitrary deeper hierarchy creation (Depth 7+, unbounded depth capability)
 * 6. Sibling slug uniqueness constraint enforcement
 * 7. Self-parenting prohibition constraint enforcement
 * 8. Circular graph cycle prevention trigger enforcement
 * 9. Exam syllabus version creation & status lifecycle
 * 10. Recursive exam syllabus node creation (Root requirement)
 * 11. Nested exam syllabus node creation (Arbitrary depth requirement tree)
 * 12. Exam syllabus to canonical mapping creation (1:1 projection)
 * 13. Mapping uniqueness enforcement (One syllabus node -> at most one canonical node)
 * 14. Taxonomy alias registration & context lookup
 * 15. Taxonomy alias uniqueness enforcement
 * 16. Guaranteed cleanup of all test fixtures & baseline invariant preservation
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
        if (['POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'].includes(k)) {
          if (!connectionString) connectionString = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const EXPECTED_BASELINES = {
  subjects: 4,
  topics: 36,
  subtopics: 0,
  learning_units: 1,
  exam_syllabi: 1,
  exam_topics: 18,
  exam_unit_mappings: 0,
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

async function runTestSuite() {
  console.log('================================================================================');
  console.log('COURAGE LIBRARY — PHASE 3R.1 RECURSIVE SCHEMA FORENSIC TEST SUITE');
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

  // Tracking fixture IDs for guaranteed cleanup
  const fixtureCanonicalIds = [];
  const fixtureAliasIds = [];
  const fixtureSyllabusVersionIds = [];
  const fixtureMappingIds = [];

  try {
    // -------------------------------------------------------------------------
    // Pre-Test Baseline Invariant Check
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

    // Clean up any stale synthetic test fixtures from previous aborted test runs
    await client.query(`DELETE FROM public.exam_syllabus_versions WHERE raw_payload_hash LIKE 'hash-synthetic%' OR raw_payload_hash LIKE 'hash-update%'`);
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

    // Fetch an active exam for syllabus version testing
    const examRes = await client.query(`SELECT id, slug FROM public.exams WHERE is_active = true LIMIT 1`);
    if (examRes.rows.length === 0) {
      throw new Error('No active exam found in database for test harness.');
    }
    const testExamId = examRes.rows[0].id;

    // -------------------------------------------------------------------------
    // Gate 1: Root Canonical Node Creation (Depth 1, SUBJECT)
    // -------------------------------------------------------------------------
    const rootRes = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        name, slug, node_type, node_depth, hierarchy_path, display_order, is_active, metadata
      ) VALUES (
        'Test Synthetic Subject', 'test-synthetic-subject', 'SUBJECT', 1, 'test-synthetic-subject', 999, true, '{"test_run": true}'::jsonb
      ) RETURNING id, root_subject_id, node_depth, node_type
    `);
    const rootNode = rootRes.rows[0];
    fixtureCanonicalIds.push(rootNode.id);

    recordGate(
      1,
      'Root Canonical Node Creation (Depth 1, SUBJECT)',
      rootNode.node_depth === 1 && rootNode.node_type === 'SUBJECT' && rootNode.root_subject_id === rootNode.id,
      `Root node created: ${rootNode.id} (root_subject_id self-initialized)`
    );

    // -------------------------------------------------------------------------
    // Gate 2: Child Canonical Node Creation (Depth 2, DOMAIN/TOPIC)
    // -------------------------------------------------------------------------
    const childRes = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
      ) VALUES (
        $1, $1, 'Test Domain Algebra', 'test-algebra', 'DOMAIN', 2, 'test-synthetic-subject.test-algebra', 1, true
      ) RETURNING id, parent_id, node_depth
    `, [rootNode.id]);
    const childNode = childRes.rows[0];
    fixtureCanonicalIds.push(childNode.id);

    recordGate(
      2,
      'Child Canonical Node Creation (Depth 2, DOMAIN)',
      childNode.parent_id === rootNode.id && childNode.node_depth === 2,
      `Child node created: ${childNode.id} under parent ${rootNode.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 3: 3-Level Canonical Hierarchy (Depth 3, SUBTOPIC)
    // -------------------------------------------------------------------------
    const l3Res = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
      ) VALUES (
        $1, $2, 'Test Subtopic Quadratics', 'test-quadratics', 'SUBTOPIC', 3, 'test-synthetic-subject.test-algebra.test-quadratics', 1, true
      ) RETURNING id, parent_id, node_depth
    `, [childNode.id, rootNode.id]);
    const l3Node = l3Res.rows[0];
    fixtureCanonicalIds.push(l3Node.id);

    recordGate(
      3,
      '3-Level Canonical Hierarchy (Depth 3, SUBTOPIC)',
      l3Node.node_depth === 3 && l3Node.parent_id === childNode.id,
      `Level 3 node created: ${l3Node.id} with full ancestor chain`
    );

    // -------------------------------------------------------------------------
    // Gate 4: 5-Level Canonical Hierarchy (Depth 5, METHOD)
    // -------------------------------------------------------------------------
    const l4Res = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
      ) VALUES (
        $1, $2, 'Test Concept Discriminant', 'test-discriminant', 'CONCEPT', 4, 'test-synthetic-subject.test-algebra.test-quadratics.test-discriminant', 1, true
      ) RETURNING id
    `, [l3Node.id, rootNode.id]);
    const l4Node = l4Res.rows[0];
    fixtureCanonicalIds.push(l4Node.id);

    const l5Res = await client.query(`
      INSERT INTO public.canonical_taxonomy_nodes (
        parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
      ) VALUES (
        $1, $2, 'Test Method Nature of Roots', 'test-nature-of-roots', 'METHOD', 5, 'test-synthetic-subject.test-algebra.test-quadratics.test-discriminant.test-nature-of-roots', 1, true
      ) RETURNING id, node_depth
    `, [l4Node.id, rootNode.id]);
    const l5Node = l5Res.rows[0];
    fixtureCanonicalIds.push(l5Node.id);

    recordGate(
      4,
      '5-Level Canonical Hierarchy (Depth 5, METHOD)',
      l5Node.node_depth === 5,
      `Depth 5 node verified: ${l5Node.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 5: Arbitrary Deeper Hierarchy (Depth 7+ Chain)
    // -------------------------------------------------------------------------
    let currentParent = l5Node.id;
    for (let d = 6; d <= 8; d++) {
      const deeperRes = await client.query(`
        INSERT INTO public.canonical_taxonomy_nodes (
          parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
        ) VALUES (
          $1, $2, $3, $4, 'CONCEPT', $5, $6, 1, true
        ) RETURNING id, node_depth
      `, [currentParent, rootNode.id, `Test Deep Level ${d}`, `test-deep-${d}`, d, `test-synthetic-subject.deep.step-${d}`]);
      currentParent = deeperRes.rows[0].id;
      fixtureCanonicalIds.push(currentParent);
    }

    recordGate(
      5,
      'Arbitrary Deeper Hierarchy Support (Depth 8+ Unbounded)',
      true,
      `Deepest node successfully reached depth 8 with parent pointer ${currentParent}`
    );

    // -------------------------------------------------------------------------
    // Gate 6: Sibling Slug Uniqueness Constraint
    // -------------------------------------------------------------------------
    let siblingDuplicateBlocked = false;
    try {
      await client.query(`
        INSERT INTO public.canonical_taxonomy_nodes (
          parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active
        ) VALUES (
          $1, $2, 'Duplicate Domain', 'test-algebra', 'DOMAIN', 2, 'dup.path', 2, true
        )
      `, [rootNode.id, rootNode.id]);
    } catch (err) {
      siblingDuplicateBlocked = err.message.includes('uq_canonical_sibling_slug') || err.code === '23505';
    }

    recordGate(
      6,
      'Sibling Slug Uniqueness Constraint Enforcement',
      siblingDuplicateBlocked,
      siblingDuplicateBlocked ? 'Duplicate sibling slug rejected by unique index' : 'Failed to block duplicate sibling'
    );

    // -------------------------------------------------------------------------
    // Gate 7: Self-Parenting Prohibition Constraint
    // -------------------------------------------------------------------------
    let selfParentBlocked = false;
    try {
      await client.query(`
        UPDATE public.canonical_taxonomy_nodes
        SET parent_id = id
        WHERE id = $1
      `, [childNode.id]);
    } catch (err) {
      selfParentBlocked = err.message.includes('chk_canonical_no_self_parent') || err.message.includes('Self-parenting is prohibited');
    }

    recordGate(
      7,
      'Self-Parenting Prohibition Enforcement',
      selfParentBlocked,
      selfParentBlocked ? 'Self-parenting update rejected by constraint / trigger' : 'Failed to block self-parenting'
    );

    // -------------------------------------------------------------------------
    // Gate 8: Circular Graph Cycle Prevention Trigger
    // -------------------------------------------------------------------------
    let cycleBlocked = false;
    try {
      // Attempt to make rootNode a child of l3Node (Root -> Child -> L3 -> Root cycle)
      await client.query(`
        UPDATE public.canonical_taxonomy_nodes
        SET parent_id = $1, node_depth = 4
        WHERE id = $2
      `, [l3Node.id, rootNode.id]);
    } catch (err) {
      cycleBlocked = err.message.includes('Circular parent relationship detected') || err.message.includes('cycle');
    }

    recordGate(
      8,
      'Circular Graph Cycle Prevention Trigger',
      cycleBlocked,
      cycleBlocked ? 'Circular hierarchy assignment prevented by trigger' : 'Failed to detect circular cycle'
    );

    // -------------------------------------------------------------------------
    // Gate 9: Exam Syllabus Version Creation & Lifecycle
    // -------------------------------------------------------------------------
    const versionRes = await client.query(`
      INSERT INTO public.exam_syllabus_versions (
        exam_id, version_tag, raw_payload_hash, status, is_active, metadata
      ) VALUES (
        $1, 'TEST_CYCLE_2026_V1', 'hash_test_payload_12345', 'DRAFT', true, '{"source": "TEST_HARNESS"}'::jsonb
      ) RETURNING id, status, is_active
    `, [testExamId]);
    const sylVersion = versionRes.rows[0];
    fixtureSyllabusVersionIds.push(sylVersion.id);

    recordGate(
      9,
      'Exam Syllabus Version Creation & Lifecycle',
      sylVersion.status === 'DRAFT' && sylVersion.is_active === true,
      `Syllabus version created: ${sylVersion.id} (tag: TEST_CYCLE_2026_V1)`
    );

    // -------------------------------------------------------------------------
    // Gate 10: Recursive Exam Syllabus Node Creation (Root Requirement)
    // -------------------------------------------------------------------------
    const sRootRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (
        syllabus_version_id, raw_title, raw_slug, node_depth, display_order,
        weightage_tier, expected_questions_min, expected_questions_max, required_cognitive_depth, is_mandatory
      ) VALUES (
        $1, 'Test Section Quantitative Ability', 'test-quant', 1, 1,
        'HIGH_YIELD', 25, 25, 'APPLICATION', true
      ) RETURNING id, raw_title, node_depth
    `, [sylVersion.id]);
    const sRoot = sRootRes.rows[0];

    recordGate(
      10,
      'Recursive Exam Syllabus Root Node Creation',
      sRoot.node_depth === 1 && sRoot.raw_title === 'Test Section Quantitative Ability',
      `Syllabus root node created: ${sRoot.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 11: Nested Exam Syllabus Node Creation (Arbitrary Depth Tree)
    // -------------------------------------------------------------------------
    const sChildRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (
        syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order,
        weightage_tier, expected_questions_min, expected_questions_max, required_cognitive_depth, is_mandatory
      ) VALUES (
        $1, $2, 'Test Module Commercial Mathematics', 'test-commercial-math', 2, 1,
        'CORE', 10, 15, 'APPLICATION', true
      ) RETURNING id, parent_node_id, node_depth
    `, [sylVersion.id, sRoot.id]);
    const sChild = sChildRes.rows[0];

    const sLeafRes = await client.query(`
      INSERT INTO public.exam_syllabus_nodes (
        syllabus_version_id, parent_node_id, raw_title, raw_slug, node_depth, display_order,
        weightage_tier, expected_questions_min, expected_questions_max, required_cognitive_depth, is_mandatory
      ) VALUES (
        $1, $2, 'Test Topic Successive Discounts', 'test-successive-discounts', 3, 1,
        'HIGH_YIELD', 2, 4, 'APPLICATION', true
      ) RETURNING id, parent_node_id, node_depth
    `, [sylVersion.id, sChild.id]);
    const sLeaf = sLeafRes.rows[0];

    recordGate(
      11,
      'Nested Exam Syllabus Node Creation (Hierarchy Tree)',
      sLeaf.node_depth === 3 && sLeaf.parent_node_id === sChild.id,
      `Syllabus leaf node created at Depth 3: ${sLeaf.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 12: Exam Syllabus to Canonical Mapping Creation (1:1 Projection)
    // -------------------------------------------------------------------------
    const mapRes = await client.query(`
      INSERT INTO public.exam_syllabus_canonical_mappings (
        syllabus_node_id, canonical_node_id, match_status, match_confidence, match_notes
      ) VALUES (
        $1, $2, 'EXACT_MATCH', 1.00, 'Synthetic verified test mapping'
      ) RETURNING id, match_status, match_confidence
    `, [sLeaf.id, l3Node.id]);
    const mapping = mapRes.rows[0];
    fixtureMappingIds.push(mapping.id);

    recordGate(
      12,
      'Exam Syllabus to Canonical Mapping Creation (1:1 Projection)',
      mapping.match_status === 'EXACT_MATCH' && Number(mapping.match_confidence) === 1.00,
      `Mapping created: ${mapping.id} (Syllabus Node ${sLeaf.id} -> Canonical Node ${l3Node.id})`
    );

    // -------------------------------------------------------------------------
    // Gate 13: Mapping Uniqueness Enforcement (One Syllabus Node -> 1 Canonical)
    // -------------------------------------------------------------------------
    let mapDuplicateBlocked = false;
    try {
      await client.query(`
        INSERT INTO public.exam_syllabus_canonical_mappings (
          syllabus_node_id, canonical_node_id, match_status, match_confidence
        ) VALUES (
          $1, $2, 'ALIAS_MATCH', 0.95
        )
      `, [sLeaf.id, childNode.id]);
    } catch (err) {
      mapDuplicateBlocked = err.message.includes('uq_exam_syllabus_canonical_mapping_node') || err.code === '23505';
    }

    recordGate(
      13,
      'Mapping Uniqueness Enforcement (1:1 Constraint)',
      mapDuplicateBlocked,
      mapDuplicateBlocked ? 'Duplicate mapping for same syllabus node rejected' : 'Failed to block duplicate mapping'
    );

    // -------------------------------------------------------------------------
    // Gate 14: Taxonomy Alias Registration & Lookup
    // -------------------------------------------------------------------------
    const aliasRes = await client.query(`
      INSERT INTO public.taxonomy_aliases (
        canonical_node_id, alias_name, normalized_alias, alias_context
      ) VALUES (
        $1, 'Quadratic Equations & Roots', 'quadratic equations and roots', 'SSC_NOMENCLATURE'
      ) RETURNING id, alias_name, normalized_alias
    `, [l3Node.id]);
    const alias = aliasRes.rows[0];
    fixtureAliasIds.push(alias.id);

    recordGate(
      14,
      'Taxonomy Alias Registration & Normalized Lookup',
      alias.normalized_alias === 'quadratic equations and roots',
      `Alias created: ${alias.id} for canonical node ${l3Node.id}`
    );

    // -------------------------------------------------------------------------
    // Gate 15: Taxonomy Alias Uniqueness Enforcement
    // -------------------------------------------------------------------------
    let aliasDuplicateBlocked = false;
    try {
      await client.query(`
        INSERT INTO public.taxonomy_aliases (
          canonical_node_id, alias_name, normalized_alias, alias_context
        ) VALUES (
          $1, 'Quadratic Equations & Roots', 'quadratic equations and roots', 'SSC_NOMENCLATURE'
        )
      `, [l3Node.id]);
    } catch (err) {
      aliasDuplicateBlocked = err.message.includes('uq_taxonomy_alias_node_context') || err.code === '23505';
    }

    recordGate(
      15,
      'Taxonomy Alias Uniqueness Enforcement',
      aliasDuplicateBlocked,
      aliasDuplicateBlocked ? 'Duplicate alias under same context rejected' : 'Failed to block duplicate alias'
    );

  } catch (err) {
    console.error('\nFATAL ERROR DURING TEST EXECUTION:', err);
    recordGate(99, 'Test Harness Execution', false, err.message);
  } finally {
    // -------------------------------------------------------------------------
    // Cleanup of all fixtures
    // -------------------------------------------------------------------------
    console.log('\nCleaning up test fixtures...');
    if (fixtureMappingIds.length > 0) {
      await client.query(`DELETE FROM public.exam_syllabus_canonical_mappings WHERE id = ANY($1::uuid[])`, [fixtureMappingIds]);
    }
    if (fixtureAliasIds.length > 0) {
      await client.query(`DELETE FROM public.taxonomy_aliases WHERE id = ANY($1::uuid[])`, [fixtureAliasIds]);
    }
    if (fixtureSyllabusVersionIds.length > 0) {
      await client.query(`DELETE FROM public.exam_syllabus_versions WHERE id = ANY($1::uuid[])`, [fixtureSyllabusVersionIds]);
    }
    if (fixtureCanonicalIds.length > 0) {
      // Reverse order deletion to avoid foreign key restrict
      for (const id of fixtureCanonicalIds.reverse()) {
        await client.query(`DELETE FROM public.canonical_taxonomy_nodes WHERE id = $1`, [id]);
      }
    }
    console.log('✓ All temporary test fixtures cleaned up successfully.\n');

    // -------------------------------------------------------------------------
    // Gate 16: Post-Test Baseline Invariant Preservation
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

    recordGate(
      16,
      'Post-Test Baseline Counts Invariant (Zero Residual Contamination)',
      postMatches,
      postMatches ? 'All baseline table counts 100% preserved' : `Baseline discrepancy: ${diffs.join(', ')}`
    );

    await client.end();
  }

  // Summary
  const allPassed = results.every(r => r.pass);
  console.log('\n================================================================================');
  console.log(`PHASE 3R.1 TEST SUITE SUMMARY: ${allPassed ? 'ALL GATES PASSED (PASS)' : 'FAILURES DETECTED (FAIL)'}`);
  console.log('================================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
