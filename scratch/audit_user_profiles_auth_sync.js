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

async function runAudit() {
  console.log("===============================================================");
  console.log("   COURAGE LIBRARY — AUTH -> USER_PROFILES AUDIT (READ-ONLY)   ");
  console.log("===============================================================");

  // 1. Fetch all Auth users
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error("Auth users query error:", authErr.message);
  }
  const authUsers = authData?.users || [];
  console.log(`\n1. AUTH USERS (auth.users) COUNT: ${authUsers.length}`);
  authUsers.forEach((u, i) => {
    console.log(`   [${i + 1}] ID: ${u.id} | Email: ${u.email} | Created: ${u.created_at} | Meta:`, u.user_metadata);
  });

  // 2. Fetch all user_profiles
  const { data: profiles, error: profErr } = await supabase
    .from("user_profiles")
    .select("*");

  if (profErr) {
    console.error("user_profiles query error:", profErr.message);
  }
  console.log(`\n2. USER PROFILES (public.user_profiles) COUNT: ${profiles?.length || 0}`);
  (profiles || []).forEach((p, i) => {
    console.log(`   [${i + 1}] ID: ${p.id} | Email: ${p.email} | FullName: ${p.full_name} | Role: ${p.role} | Created: ${p.created_at}`);
  });

  // 3. Reconcile Auth Users vs Profiles
  const profileIdSet = new Set((profiles || []).map(p => p.id));
  const missingProfiles = authUsers.filter(u => !profileIdSet.has(u.id));

  console.log(`\n3. RECONCILIATION SUMMARY:`);
  console.log(`   - Auth Users Count: ${authUsers.length}`);
  console.log(`   - Profiles Count: ${profiles?.length || 0}`);
  console.log(`   - Missing Profiles Count: ${missingProfiles.length}`);

  if (missingProfiles.length > 0) {
    console.log("\n   MISSING PROFILES DETAILS:");
    missingProfiles.forEach(m => {
      console.log(`   -> Auth ID: ${m.id} | Email: ${m.email} | Name: ${m.user_metadata?.full_name || 'N/A'}`);
    });
  }

  // 4. Test Sample Insert Simulation or schema check (Rollback / Read-only)
  console.log("\n4. CHECKING USER_PROFILES TABLE SCHEMA COLUMNS:");
  // Let's select 1 row to see column keys
  if (profiles && profiles.length > 0) {
    console.log("   Columns present in user_profiles row:", Object.keys(profiles[0]));
  } else {
    // Attempt empty select
    const { data: sampleRow, error: sampleErr } = await supabase.from("user_profiles").select("*").limit(1);
    console.log("   Sample query result:", sampleRow, sampleErr ? sampleErr.message : "OK");
  }
}

runAudit().catch(console.error);
