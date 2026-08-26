/**
 * COURAGE LIBRARY — CONTROLLED PILOT MIGRATION SCRIPT (10 Qs)
 * Full End-to-End Chain Migration
 */

global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          process.env[key] = val;
        }
      }
    });
  }
}

loadEnv();

const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const targetClient = createClient(targetUrl, targetKey);

async function safeDb(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fn();
      if (!res.error || !res.error.message?.includes("fetch failed")) {
        return res;
      }
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return await fn();
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function runControlledPilot() {
  console.log("===============================================================");
  console.log("   COURAGE LIBRARY — CONTROLLED PILOT MIGRATION (10 Qs)        ");
  console.log("===============================================================");

  // Read Pilot Selection
  const selectionRaw = fs.readFileSync(path.join(process.cwd(), "scratch", "pilot_selection.json"), "utf8");
  const pilotData = JSON.parse(selectionRaw);

  const legacyCat = pilotData.category;
  const legacySched = pilotData.scheduledExam;
  const legacyQs = pilotData.questions;

  console.log(`- Target Category: ${legacyCat.name} (${legacyCat.id})`);
  console.log(`- Target Scheduled Mock: ${legacySched.id}`);
  console.log(`- Target Questions Count: ${legacyQs.length}`);

  // 1. Conducting Org & Exam
  console.log("\n1. Migrating Conducting Org & Exam...");
  let orgId = "00000000-0000-0000-0000-000000000001";
  const { data: defaultOrg } = await safeDb(() =>
    targetClient.from("conducting_orgs").upsert(
      { id: orgId, name: "Uttar Pradesh Police Recruitment Board", slug: "uppbpb" },
      { onConflict: "id" }
    ).select("id").single()
  );
  if (defaultOrg) orgId = defaultOrg.id;

  const examSlug = slugify(legacyCat.name);
  const { data: examData } = await safeDb(() =>
    targetClient.from("exams").upsert(
      {
        id: legacyCat.id,
        org_id: orgId,
        title: legacyCat.name,
        slug: examSlug,
        category: "Police Exams",
        description: legacyCat.description,
        is_active: true,
      },
      { onConflict: "id" }
    ).select("id").single()
  );
  console.log(`  ✓ Exam: ${legacyCat.name} (${examData.id})`);

  // 2. Exam Cycle & Exam Pattern
  console.log("\n2. Migrating Exam Cycle & Pattern...");
  const { data: cycleData, error: cycleErr } = await safeDb(() =>
    targetClient.from("exam_cycles").upsert(
      {
        id: legacyCat.id,
        exam_id: examData.id,
        cycle_year: 2026,
        status: "active",
      },
      { onConflict: "id" }
    ).select("id").single()
  );
  if (cycleErr) console.error("Cycle error:", cycleErr.message);
  else console.log(`  ✓ Exam Cycle ID: ${cycleData.id}`);

  const patternId = legacySched.pattern_id || "77777777-7777-7777-7777-777777777777";
  const { data: patternData, error: patErr } = await safeDb(() =>
    targetClient.from("exam_patterns").upsert(
      {
        id: patternId,
        exam_cycle_id: cycleData.id,
        name: "Standard Pattern",
        tier_name: "Tier 1",
        duration_minutes: 20,
        total_questions: 10,
        total_marks: 20,
        negative_mark_value: 0.5,
        is_active: true,
      },
      { onConflict: "id" }
    ).select("id").single()
  );
  if (patErr) console.error("Pattern error:", patErr.message);
  else console.log(`  ✓ Exam Pattern ID: ${patternData.id}`);

  // 3. Subject & Topics
  console.log("\n3. Synthesizing Subject & Topics...");
  let subjectId = null;
  const { data: existingSub } = await safeDb(() =>
    targetClient.from("subjects").select("id").eq("slug", "general-hindi").maybeSingle()
  );

  if (existingSub) {
    subjectId = existingSub.id;
  } else {
    const { data: newSub } = await safeDb(() =>
      targetClient.from("subjects").insert({
        name: "General Hindi",
        slug: "general-hindi",
        is_active: true,
      }).select("id").single()
    );
    if (newSub) subjectId = newSub.id;
  }

  const topicMap = new Map();
  for (const q of legacyQs) {
    const tName = (q.topic || "General Hindi").trim();
    const tKey = tName.toLowerCase();

    if (!topicMap.has(tKey)) {
      const tSlug = slugify(`hindi-${tName}`);
      const { data: existingTop } = await safeDb(() =>
        targetClient.from("topics").select("id").eq("slug", tSlug).maybeSingle()
      );

      if (existingTop) {
        topicMap.set(tKey, existingTop.id);
      } else {
        const { data: newTop } = await safeDb(() =>
          targetClient.from("topics").insert({
            subject_id: subjectId,
            name: tName,
            slug: tSlug,
            importance_level: "medium",
            is_active: true,
          }).select("id").single()
        );
        if (newTop) topicMap.set(tKey, newTop.id);
      }
    }
  }
  console.log(`  ✓ Subject ID: ${subjectId} | Topics: ${topicMap.size}`);

  // 4. Questions, Versions, Options & Hidden Answers
  console.log("\n4. Migrating 10 Questions, Versions, Options & Hidden Answers...");
  const migratedVersionIds = [];

  for (let idx = 0; idx < legacyQs.length; idx++) {
    const q = legacyQs[idx];
    const tName = (q.topic || "General Hindi").trim().toLowerCase();
    const topicId = topicMap.get(tName) || topicMap.values().next().value;
    const langCode = (q.language === "hindi" || q.language === "hi") ? "hi" : "en";

    // A. Base Question
    const { data: qData } = await safeDb(() =>
      targetClient.from("questions").upsert(
        {
          id: q.id,
          canonical_topic_id: topicId,
          status: "published",
        },
        { onConflict: "id" }
      ).select("id").single()
    );

    // B. Question Version
    const { data: qvData } = await safeDb(() =>
      targetClient.from("question_versions").upsert(
        {
          id: q.id,
          question_id: qData.id,
          version_number: 1,
          question_text: q.question_text,
          difficulty: q.difficulty || "medium",
          language: langCode,
          options_type: q.options_type || "text",
          question_image_url: q.question_image || null,
          is_current: true,
        },
        { onConflict: "id" }
      ).select("id").single()
    );
    migratedVersionIds.push(qvData.id);

    // C. Question Options
    if (q.options && typeof q.options === "object") {
      const optionRows = Object.entries(q.options).map(([key, val], optIdx) => ({
        question_version_id: qvData.id,
        option_key: key.toUpperCase(),
        option_text: typeof val === "string" ? val : (val.text || ""),
        order_index: optIdx + 1,
      }));

      // Delete existing options for this version to avoid duplicates on re-run
      await safeDb(() =>
        targetClient.from("question_options").delete().eq("question_version_id", qvData.id)
      );

      await safeDb(() =>
        targetClient.from("question_options").insert(optionRows)
      );
    }

    // D. Hidden Server-Side Answer Key
    await safeDb(() =>
      targetClient.from("question_answers").upsert(
        {
          question_version_id: qvData.id,
          correct_option_key: String(q.correct_answer).toUpperCase().trim(),
          explanation_md: q.explanation || null,
        },
        { onConflict: "question_version_id" }
      )
    );
  }
  console.log(`  ✓ Questions Migrated: ${migratedVersionIds.length}`);

  // 5. Mock Template & Mock Test
  console.log("\n5. Migrating Mock Template & Mock Test Blueprint...");
  const mockSlug = "up-police-constable-mini-mock-pilot";
  const mockTitle = "UP Police Constable Official Pilot Mini Mock";

  const { data: tplData, error: tplErr } = await safeDb(() =>
    targetClient.from("mock_templates").upsert(
      {
        id: legacySched.id,
        exam_id: examData.id,
        exam_cycle_id: cycleData.id,
        pattern_id: patternData.id,
        title: mockTitle,
        slug: mockSlug,
        test_type: "sectional",
        is_free: true,
        is_active: true,
      },
      { onConflict: "id" }
    ).select("id").single()
  );

  if (tplErr) console.error("Template error:", tplErr.message);

  const { data: mockData, error: mockErr } = await safeDb(() =>
    targetClient.from("mock_tests").upsert(
      {
        id: legacySched.id,
        template_id: tplData.id,
        title: mockTitle,
        slug: mockSlug,
        duration_minutes: 20,
        total_questions: 10,
        total_marks: 20,
        is_free: true,
        status: "published",
      },
      { onConflict: "id" }
    ).select("id").single()
  );

  if (mockErr) console.error("Mock test error:", mockErr.message);
  else console.log(`  ✓ Mock Test: ${mockData.title} (${mockData.id})`);

  // 6. Mock Section & Mock Questions
  console.log("\n6. Mapping Mock Section & Mock Questions...");
  const { data: secData, error: secErr } = await safeDb(() =>
    targetClient.from("mock_sections").upsert(
      {
        id: patternId,
        mock_test_id: mockData.id,
        subject_id: subjectId,
        section_name: "General Hindi",
        section_order: 1,
        num_questions: 10,
        marks_per_question: 2.0,
        negative_mark: 0.5,
      },
      { onConflict: "id" }
    ).select("id").single()
  );

  if (secErr) console.error("Section error:", secErr.message);

  const mockQuestionRows = migratedVersionIds.map((qvId, qIdx) => ({
    mock_test_id: mockData.id,
    mock_section_id: secData.id,
    question_version_id: qvId,
    question_order: qIdx + 1,
    marks: 2.0,
    negative_mark: 0.5,
  }));

  // Clean old mappings for this test
  await safeDb(() =>
    targetClient.from("mock_questions").delete().eq("mock_test_id", mockData.id)
  );

  const { error: mqErr } = await safeDb(() =>
    targetClient.from("mock_questions").insert(mockQuestionRows)
  );

  if (mqErr) console.error("Mock questions error:", mqErr.message);
  else console.log(`  ✓ Mapped ${mockQuestionRows.length} questions into mock test.`);

  console.log("\n===============================================================");
  console.log("   CONTROLLED PILOT MIGRATION COMPLETED SUCCESSFULLY           ");
  console.log("===============================================================");
}

runControlledPilot().catch(console.error);
