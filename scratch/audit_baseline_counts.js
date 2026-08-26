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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in process.env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
  "exam_categories",
  "conducting_bodies",
  "exams",
  "subjects",
  "topics",
  "questions",
  "question_options",
  "mock_tests",
  "test_sections",
  "mock_test_questions",
  "flashcard_decks",
  "flashcards",
  "articles",
  "article_versions",
  "courses",
  "course_modules",
  "course_lessons",
  "descriptive_questions",
  "evaluation_rubrics",
  "institutes",
  "coaching_batches",
  "batch_assignments",
  "subscription_plans",
];

async function run() {
  const counts = {};
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (error) {
      counts[t] = `Error: ${error.message}`;
    } else {
      counts[t] = count || 0;
    }
  }
  console.log("BASELINE_COUNTS:", JSON.stringify(counts, null, 2));
}

run();
