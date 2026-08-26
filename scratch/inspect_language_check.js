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

async function testLanguages() {
  const languagesToTest = ["en", "hi", "hindi", "english", "bilingual", "both", "mr", "ta"];
  for (const lang of languagesToTest) {
    const { error } = await supabase.from("question_versions").insert({
      id: "00000000-0000-0000-0000-000000000099",
      question_id: "268dcf65-7870-4ce2-92bf-6912c520b65f",
      version_number: 999,
      question_text: "test",
      language: lang,
    });
    console.log(`Language '${lang}' test result:`, error ? error.message : "ALLOWED");
    if (!error) {
      await supabase.from("question_versions").delete().eq("id", "00000000-0000-0000-0000-000000000099");
    }
  }
}

testLanguages().catch(console.error);
