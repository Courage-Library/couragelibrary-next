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

async function inspectSchema() {
  const { data: qSample } = await supabase.from("questions").select("*").limit(2);
  console.log("QUESTIONS SAMPLE:", qSample);

  const { data: qvSample } = await supabase.from("question_versions").select("*").limit(2);
  console.log("QUESTION_VERSIONS SAMPLE:", qvSample);

  const { data: qoSample } = await supabase.from("question_options").select("*").limit(2);
  console.log("QUESTION_OPTIONS SAMPLE:", qoSample);

  const { data: qaSample } = await supabase.from("question_answers").select("*").limit(2);
  console.log("QUESTION_ANSWERS SAMPLE:", qaSample);
}

inspectSchema().catch(console.error);
