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
  // Let's inspect subjects table schema by dummy insert
  const { error: sErr } = await supabase.from("subjects").insert({});
  console.log("Subjects error hint:", sErr?.message);

  const { error: qErr } = await supabase.from("questions").insert({});
  console.log("Questions error hint:", qErr?.message);

  const { error: tErr } = await supabase.from("topics").insert({});
  console.log("Topics error hint:", tErr?.message);

  const { error: optErr } = await supabase.from("question_options").insert({});
  console.log("Question Options error hint:", optErr?.message);
}

inspect().catch(console.error);
