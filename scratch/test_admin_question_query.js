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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testQuery() {
  console.log("=== TESTING ADMIN QUESTION HIERARCHY QUERY ===");

  // 1. Fetch questions with versions, options, answers, and topics
  const { data: questions, error } = await supabase
    .from("questions")
    .select(`
      id,
      canonical_topic_id,
      status,
      created_at,
      topics (
        id,
        name,
        slug,
        subject_id,
        subjects (
          id,
          name,
          slug
        )
      ),
      question_versions (
        id,
        version_number,
        question_text,
        difficulty,
        language,
        options_type,
        question_image_url,
        is_current,
        question_options (
          id,
          option_key,
          option_text,
          option_image_url,
          order_index
        ),
        question_answers (
          correct_option_key,
          explanation_md
        )
      ),
      question_sources (
        id,
        exam_name,
        year,
        source_type
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Query error:", error.message);
    return;
  }

  console.log(`✓ Fetched ${questions.length} questions.`);
  if (questions.length > 0) {
    const sample = questions[0];
    console.log("Sample Question:", {
      id: sample.id,
      topic: sample.topics?.name,
      subject: sample.topics?.subjects?.name,
      versionsCount: sample.question_versions?.length,
      currentVersionText: sample.question_versions?.[0]?.question_text,
      optionsCount: sample.question_versions?.[0]?.question_options?.length,
      answerKey: sample.question_versions?.[0]?.question_answers?.correct_option_key,
    });
  }
}

testQuery().catch(console.error);
