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

async function run() {
  const { data: mocks, error } = await supabase
    .from("mock_tests")
    .select("id, title, slug, template_id, mock_templates(id, exam_id, pattern_id, exams(id, title, slug), exam_patterns(id, name))");

  console.log("MOCK TESTS DATA:", JSON.stringify(mocks, null, 2));

  const { data: patterns } = await supabase
    .from("exam_patterns")
    .select("id, name, exam_cycles(exam_id, exams(id, title, slug))");

  console.log("PATTERNS:", JSON.stringify(patterns, null, 2));
}

run();
