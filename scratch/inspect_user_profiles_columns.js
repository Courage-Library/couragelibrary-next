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

async function inspectColumns() {
  // Test query on user_profiles
  const { data, error } = await supabase.from("user_profiles").select("*").limit(1);
  console.log("user_profiles select result:", { data, error });

  // Let's test inserting a dummy profile for existing user 'd58e283b-0ff4-4d03-ac26-0e517380d203' and select it
  const { data: insData, error: insErr } = await supabase.from("user_profiles").upsert({
    id: "d58e283b-0ff4-4d03-ac26-0e517380d203",
    full_name: "Jan Mohammad",
    language_preference: "en",
    is_active: true,
  }).select("*").single();

  console.log("Upsert test for existing user:", { insData, insErr });
}

inspectColumns().catch(console.error);
