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

async function verifyPilotIntegrity() {
  console.log("=== VERIFYING PILOT MIGRATION INTEGRITY ===");

  // 1. Check Exam
  const { data: exam } = await supabase.from("exams").select("*").eq("id", "26d8b7da-ea3c-4ed9-a04e-b55124d737dc").single();
  console.log("1. Migrated Exam:", exam?.title, "(ID:", exam?.id, ")");

  // 2. Check Questions & Versions
  const selection = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scratch", "pilot_selection.json"), "utf8"));
  const qIds = selection.questions.map((q) => q.id);

  const { data: qList } = await supabase.from("questions").select("*").in("id", qIds);
  console.log(`2. Questions in DB: ${qList?.length} / ${qIds.length}`);

  const { data: qvList } = await supabase.from("question_versions").select("*").in("id", qIds);
  console.log(`3. Question Versions in DB: ${qvList?.length} / ${qIds.length}`);

  const { data: optList } = await supabase.from("question_options").select("*").in("question_version_id", qIds);
  console.log(`4. Question Options in DB: ${optList?.length} (Expected: 40)`);

  const { data: ansList } = await supabase.from("question_answers").select("*").in("question_version_id", qIds);
  console.log(`5. Question Hidden Answers in DB: ${ansList?.length} (Expected: 10)`);

  // 6. Check Mock Test
  const { data: mockList } = await supabase.from("mock_tests").select("*").limit(5);
  console.log("6. Mock Tests in DB:", mockList);

  const { data: secList } = await supabase.from("mock_sections").select("*").limit(5);
  console.log("7. Mock Sections in DB:", secList);

  const { data: mqList } = await supabase.from("mock_questions").select("*").limit(15);
  console.log("8. Mock Questions in DB:", mqList?.length);

  // 7. Check Protected Existing Content (SSC CGL)
  const { count: sscQCount } = await supabase.from("question_versions").select("*", { count: "exact", head: true }).eq("difficulty", "medium");
  console.log(`9. Total Question Versions in DB: ${sscQCount} (Should be 20 previous + 10 new = 30)`);
}

verifyPilotIntegrity().catch(console.error);
