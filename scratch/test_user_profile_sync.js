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

const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(targetUrl, targetKey);

async function testSyncLogic() {
  console.log("=== TESTING USER PROFILE SYNCHRONIZATION LOGIC ===");

  // 1. Fetch all Auth Users
  const { data: authData } = await supabase.auth.admin.listUsers();
  const authUsers = authData?.users || [];
  console.log(`Found ${authUsers.length} Auth users in target project.`);

  // 2. Perform idempotent reconciliation for existing users
  for (const u of authUsers) {
    const fullName = u.user_metadata?.full_name || u.raw_user_meta_data?.full_name || u.email?.split("@")[0] || "Student";
    const lang = u.user_metadata?.language_preference || "en";

    console.log(`Syncing profile for: ${u.email} (${u.id})...`);
    const { data: upserted, error } = await supabase
      .from("user_profiles")
      .upsert(
        {
          id: u.id,
          full_name: fullName,
          language_preference: lang === "hi" ? "hi" : "en",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error) {
      console.error(`  Error syncing ${u.email}:`, error.message);
    } else {
      console.log(`  ✓ Synced Profile:`, upserted);
    }
  }

  // 3. Verify final user_profiles count and matching
  const { data: finalProfiles } = await supabase.from("user_profiles").select("*");
  console.log(`\nFinal user_profiles count: ${finalProfiles.length} / ${authUsers.length}`);

  const profileMap = new Map(finalProfiles.map(p => [p.id, p]));
  authUsers.forEach(u => {
    const prof = profileMap.get(u.id);
    console.log(`✓ Auth User [${u.email}] -> Profile [${prof ? prof.full_name : 'MISSING'}] (Active: ${prof?.is_active})`);
  });
}

testSyncLogic().catch(console.error);
