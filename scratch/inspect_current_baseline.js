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

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCurrentBaseline() {
  const tables = [
    "conducting_orgs", "exams", "subjects", "topics", "questions",
    "question_versions", "question_options", "question_answers",
    "mock_templates", "mock_tests", "mock_sections", "mock_questions",
    "test_attempts", "attempt_answers", "test_results", "section_results",
    "institutes", "coaching_batches", "learning_resources", "articles",
    "courses", "subscription_plans", "mistake_vault", "student_streaks",
    "coins_ledger"
  ];

  const summary = {};
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      summary[t] = error ? `Error: ${error.message}` : count;
    } catch (e) {
      summary[t] = `Exception: ${e.message}`;
    }
  }

  console.log("CURRENT DATABASE BASELINE COUNTS:", JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(process.cwd(), "scratch", "current_baseline_counts.json"), JSON.stringify(summary, null, 2));
}

checkCurrentBaseline().catch(console.error);
