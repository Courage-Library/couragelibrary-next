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

async function inspect() {
  const targetTables = ["exams", "subjects", "topics", "questions", "mock_tests", "mock_sections", "flashcard_decks", "flashcards", "articles", "subscription_plans"];
  const res = {};
  for (const t of targetTables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      res[t] = `Error: ${error.message}`;
    } else if (data && data.length > 0) {
      res[t] = Object.keys(data[0]);
    } else {
      // try inserting empty object to see column error or select columns
      res[t] = "Table exists (0 rows)";
    }
  }
  console.log("COLUMNS_INSPECTION:", JSON.stringify(res, null, 2));
}

inspect().catch(console.error);
