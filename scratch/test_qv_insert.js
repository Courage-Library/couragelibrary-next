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

async function testQV() {
  const { data: q, error: qErr } = await supabase.from("questions").insert({ canonical_topic_id: "d6341b4a-0e07-4a60-8318-dcd6e3c46a26" }).select("id").single();
  if (qErr) {
    console.error("Q Insert Error:", qErr.message);
    return;
  }

  console.log("Created Q ID:", q.id);

  const { data: qv, error: qvErr } = await supabase.from("question_versions").insert({
    question_id: q.id,
    version_number: 1,
    question_text: "Select the related word: Thermometer : Temperature :: Barometer : ?",
    status: "PUBLISHED"
  }).select("id").single();

  if (qvErr) {
    console.error("QV Insert Error:", qvErr.message);
    return;
  }

  console.log("Created QV ID:", qv.id);

  // Now insert option
  const { data: opt, error: optErr } = await supabase.from("question_options").insert({
    question_version_id: qv.id,
    option_key: "A",
    option_text: "Atmospheric Pressure",
    is_correct: true,
    display_order: 1
  }).select("id").single();

  if (optErr) {
    console.error("Opt Insert Error:", optErr.message);
  } else {
    console.log("Created Option ID:", opt.id);
  }
}

testQV().catch(console.error);
