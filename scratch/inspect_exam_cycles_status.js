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

async function testCycleStatus() {
  const { data: existing } = await supabase.from("exam_cycles").select("*").limit(5);
  console.log("EXISTING EXAM CYCLES:", existing);

  const statuses = ["active", "upcoming", "completed", "draft", "in_progress"];
  for (const s of statuses) {
    const { error } = await supabase.from("exam_cycles").insert({
      id: "00000000-0000-0000-0000-000000000098",
      exam_id: "26d8b7da-ea3c-4ed9-a04e-b55124d737dc",
      cycle_year: 2026,
      status: s,
    });
    console.log(`Status '${s}':`, error ? error.message : "ALLOWED");
    if (!error) {
      await supabase.from("exam_cycles").delete().eq("id", "00000000-0000-0000-0000-000000000098");
      break;
    }
  }
}

testCycleStatus().catch(console.error);
