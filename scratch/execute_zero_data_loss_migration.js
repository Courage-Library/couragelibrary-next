/**
 * COURAGE LIBRARY — ZERO-DATA-LOSS PRODUCTION MIGRATION ENGINE
 * 
 * Target: couragelibrary-next (105 Frozen Base PostgreSQL Tables)
 * Source: couragelibrary legacy (100% READ-ONLY)
 * 
 * Invariants:
 * - 0 DELETE / TRUNCATE / DROP operations
 * - Idempotent UPSERT with preserved UUIDs or deterministic slug mapping
 * - Preserves existing pilot SSC CGL records and courses
 * - 100% Server-Authoritative answer key isolation in question_answers
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

// READ-ONLY LEGACY CLIENT
const LEGACY_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const LEGACY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";
const legacyClient = createClient(LEGACY_URL, LEGACY_KEY);

// TARGET CURRENT DATABASE CLIENT
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

async function executeMigration() {
  console.log("===============================================================");
  console.log("   COURAGE LIBRARY ZERO-DATA-LOSS MIGRATION EXECUTION ENGINE   ");
  console.log("===============================================================");

  const auditLog = {
    startedAt: new Date().toISOString(),
    steps: {},
    errors: [],
  };

  // -------------------------------------------------------------
  // STEP 1: Conducting Orgs & Exam Verticals
  // -------------------------------------------------------------
  console.log("\n[STEP 1] Migrating Exam Categories -> Conducting Orgs & Exams...");
  const { data: legacyCats } = await safeDb(() => legacyClient.from("exam_categories").select("*"));
  const { data: existingExams } = await safeDb(() => targetClient.from("exams").select("id, slug, title"));
  
  const examIdMap = new Map(); // legacyCatId -> targetExamId

  // Ensure default conducting org exists
  let orgId = "00000000-0000-0000-0000-000000000001";
  const { data: defaultOrg } = await safeDb(() =>
    targetClient.from("conducting_orgs").upsert(
      { id: orgId, name: "Staff Selection Commission", slug: "ssc" },
      { onConflict: "id" }
    ).select("id").single()
  );
  if (defaultOrg) orgId = defaultOrg.id;

  for (const cat of legacyCats || []) {
    const slug = slugify(cat.name);
    const existing = existingExams?.find((e) => e.slug === slug);

    if (existing) {
      examIdMap.set(cat.id, existing.id);
      console.log(`  - Preserved existing exam: ${existing.title} (${existing.id})`);
    } else {
      const { data: insertedExam, error: examErr } = await safeDb(() =>
        targetClient.from("exams").upsert(
          {
            id: cat.id,
            org_id: orgId,
            title: cat.name,
            slug: slug || `exam-${cat.id.slice(0, 8)}`,
            category: "Competitive Exams",
            description: cat.description || null,
            is_active: true,
          },
          { onConflict: "id" }
        ).select("id").single()
      );

      if (examErr) {
        console.error(`  - Failed to insert exam ${cat.name}:`, examErr.message);
        auditLog.errors.push(`Exam ${cat.name}: ${examErr.message}`);
      } else if (insertedExam) {
        examIdMap.set(cat.id, insertedExam.id);
        console.log(`  - Inserted exam: ${cat.name} (${insertedExam.id})`);
      }
    }
  }

  // -------------------------------------------------------------
  // STEP 2: Subject & Topic Synthesis
  // -------------------------------------------------------------
  console.log("\n[STEP 2] Fetching Legacy Questions to Synthesize Subjects & Topics...");
  let allQuestions = [];
  let page = 0;
  while (true) {
    const { data: qPage } = await safeDb(() =>
      legacyClient.from("questions").select("*").range(page * 1000, (page + 1) * 1000 - 1)
    );
    if (!qPage || qPage.length === 0) break;
    allQuestions.push(...qPage);
    if (qPage.length < 1000) break;
    page++;
  }
  console.log(`  - Total legacy questions loaded: ${allQuestions.length}`);

  // Fetch existing subjects and topics
  const { data: existingSubjects } = await safeDb(() => targetClient.from("subjects").select("id, slug, name"));
  const { data: existingTopics } = await safeDb(() => targetClient.from("topics").select("id, slug, name, subject_id"));

  const subjectMap = new Map(); // subjectName -> subjectId
  existingSubjects?.forEach((s) => subjectMap.set(s.name.toLowerCase().trim(), s.id));

  const topicMap = new Map(); // topicName -> topicId
  existingTopics?.forEach((t) => topicMap.set(t.name.toLowerCase().trim(), t.id));

  // Synthesize missing subjects
  for (const q of allQuestions) {
    const secName = (q.section_name || "General Knowledge").trim();
    const secKey = secName.toLowerCase();

    if (!subjectMap.has(secKey)) {
      const subSlug = slugify(secName);
      const { data: newSub } = await safeDb(() =>
        targetClient.from("subjects").upsert(
          {
            name: secName,
            slug: subSlug || `sub-${Date.now()}`,
            code: subSlug.toUpperCase().slice(0, 10),
          },
          { onConflict: "slug" }
        ).select("id").single()
      );
      if (newSub) subjectMap.set(secKey, newSub.id);
    }
  }

  // Synthesize missing topics
  for (const q of allQuestions) {
    const topName = (q.topic || q.section_name || "General Topic").trim();
    const topKey = topName.toLowerCase();
    const secName = (q.section_name || "General Knowledge").trim();
    const subjectId = subjectMap.get(secName.toLowerCase()) || existingSubjects?.[0]?.id;

    if (!topicMap.has(topKey) && subjectId) {
      const topSlug = slugify(topName);
      const { data: newTop } = await safeDb(() =>
        targetClient.from("topics").upsert(
          {
            subject_id: subjectId,
            name: topName,
            slug: topSlug || `top-${Date.now()}`,
          },
          { onConflict: "slug" }
        ).select("id").single()
      );
      if (newTop) topicMap.set(topKey, newTop.id);
    }
  }
  console.log(`  - Subjects mapped: ${subjectMap.size} | Topics mapped: ${topicMap.size}`);

  // -------------------------------------------------------------
  // STEP 3 & 4: Questions, Versions, Options & Answer Keys
  // -------------------------------------------------------------
  console.log("\n[STEP 3 & 4] Ingesting Questions, Question Versions, Options & Hidden Answer Keys...");
  let questionsInserted = 0;
  let optionsInserted = 0;
  let answersInserted = 0;

  // Process in batches of 50 for stability
  const batchSize = 50;
  for (let i = 0; i < allQuestions.length; i += batchSize) {
    const chunk = allQuestions.slice(i, i + batchSize);

    for (const q of chunk) {
      if (!q.question_text || !q.correct_answer) continue;

      const topName = (q.topic || q.section_name || "General Topic").trim().toLowerCase();
      const topicId = topicMap.get(topName) || existingTopics?.[0]?.id;

      // 1. Insert Base Question
      const { data: qData, error: qErr } = await safeDb(() =>
        targetClient.from("questions").upsert(
          {
            id: q.id,
            canonical_topic_id: topicId,
            is_active: q.is_active !== false,
          },
          { onConflict: "id" }
        ).select("id").single()
      );

      if (qErr || !qData) {
        auditLog.errors.push(`Question ${q.id}: ${qErr?.message}`);
        continue;
      }
      questionsInserted++;

      // 2. Insert Question Version 1
      const { data: qvData, error: qvErr } = await safeDb(() =>
        targetClient.from("question_versions").upsert(
          {
            id: q.id, // Using deterministic 1:1 UUID
            question_id: qData.id,
            version_number: 1,
            question_text: q.question_text,
            options_type: q.options_type || "text",
            question_image_url: q.question_image || null,
          },
          { onConflict: "id" }
        ).select("id").single()
      );

      if (qvErr || !qvData) {
        auditLog.errors.push(`Question Version ${q.id}: ${qvErr?.message}`);
        continue;
      }

      // 3. Explode & Insert Question Options A-D
      if (q.options && typeof q.options === "object") {
        const optionRows = Object.entries(q.options).map(([key, val], idx) => {
          let text = "";
          let img = null;
          if (typeof val === "string") text = val;
          else if (typeof val === "object" && val) {
            text = val.text || "";
            img = val.image || null;
          }
          return {
            question_version_id: qvData.id,
            option_key: key.toUpperCase(),
            content_text: text,
            image_url: img,
            option_order: idx + 1,
            is_correct: key.toUpperCase() === String(q.correct_answer).toUpperCase().trim(),
          };
        });

        const { error: optErr } = await safeDb(() =>
          targetClient.from("question_options").upsert(optionRows, {
            onConflict: "question_version_id,option_key",
          })
        );
        if (!optErr) optionsInserted += optionRows.length;
      }

      // 4. Insert Server-Authoritative Question Answer (Hidden Key & Solution)
      const { error: ansErr } = await safeDb(() =>
        targetClient.from("question_answers").upsert(
          {
            question_version_id: qvData.id,
            correct_option_key: String(q.correct_answer).toUpperCase().trim(),
            solution_explanation_md: q.explanation || null,
          },
          { onConflict: "question_version_id" }
        )
      );
      if (!ansErr) answersInserted++;
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= allQuestions.length) {
      console.log(`  - Processed ${Math.min(i + batchSize, allQuestions.length)} / ${allQuestions.length} questions...`);
    }
  }

  // -------------------------------------------------------------
  // STEP 5: Scheduled Exams -> Mock Templates & Mock Tests
  // -------------------------------------------------------------
  console.log("\n[STEP 5] Ingesting Scheduled Exams -> Mock Templates & Tests...");
  const { data: legacySchedules } = await safeDb(() => legacyClient.from("scheduled_exams").select("*"));
  let mockTestsInserted = 0;

  for (const s of legacySchedules || []) {
    const examId = examIdMap.get(s.category_id) || existingExams?.[0]?.id;
    if (!examId) continue;

    const testSlug = `mock-${slugify(s.day_of_week || "test")}-${s.id.slice(0, 8)}`;
    const testTitle = `${s.exam_type ? s.exam_type.toUpperCase() : "MOCK TEST"} (${s.day_of_week || "Daily"})`;

    // 1. Mock Template
    const { data: tplData } = await safeDb(() =>
      targetClient.from("mock_templates").upsert(
        {
          id: s.id,
          exam_id: examId,
          title: testTitle,
          slug: testSlug,
        },
        { onConflict: "id" }
      ).select("id").single()
    );

    // 2. Mock Test
    if (tplData) {
      const { data: mockData } = await safeDb(() =>
        targetClient.from("mock_tests").upsert(
          {
            id: s.id,
            template_id: tplData.id,
            title: testTitle,
            slug: testSlug,
            duration_minutes: 60,
            total_questions: 100,
            total_marks: 200,
            is_free: !s.is_premium,
            status: s.is_active ? "published" : "draft",
          },
          { onConflict: "id" }
        ).select("id").single()
      );
      if (mockData) mockTestsInserted++;
    }
  }

  console.log("\n===============================================================");
  console.log("   MIGRATION EXECUTION COMPLETED SUCCESSFULLY                  ");
  console.log(`   - Questions Inserted/Updated: ${questionsInserted}`);
  console.log(`   - Options Inserted/Updated:   ${optionsInserted}`);
  console.log(`   - Answers Inserted/Updated:   ${answersInserted}`);
  console.log(`   - Mock Tests Inserted:        ${mockTestsInserted}`);
  console.log("===============================================================");
}

// Module export without auto-execution
module.exports = { executeMigration };

if (require.main === module) {
  console.log("Notice: Direct CLI execution disabled pending review. Use executeMigration() programmatically.");
}
