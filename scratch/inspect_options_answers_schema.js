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

async function inspectOptAns() {
  const { data: qv } = await supabase.from("question_versions").select("id").limit(1).single();
  console.log("TEST QV ID:", qv.id);

  // Test Option Insert
  const { error: optErr } = await supabase.from("question_options").insert({
    question_version_id: qv.id,
    option_key: "A",
    content_text: "Option A test",
    option_order: 1,
    is_correct: false,
  });
  console.log("OPT INSERT ERROR:", optErr ? optErr.message : "SUCCESS");

  // Test Answer Insert
  const { error: ansErr } = await supabase.from("question_answers").insert({
    question_version_id: qv.id,
    correct_option_key: "A",
    solution_explanation_md: "Explanation test",
  });
  console.log("ANS INSERT ERROR:", ansErr ? ansErr.message : "SUCCESS");
}

inspectOptAns().catch(console.error);
