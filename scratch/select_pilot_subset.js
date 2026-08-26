global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const LEGACY_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const LEGACY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";
const legacyClient = createClient(LEGACY_URL, LEGACY_KEY);

async function selectPilot() {
  // Select UP Police Constable category
  const { data: cat } = await legacyClient.from("exam_categories").select("*").eq("name", "UP Police Constable").single();
  console.log("SELECTED CATEGORY:", cat);

  // Select 1 scheduled exam for this category
  const { data: sched } = await legacyClient.from("scheduled_exams").select("*").eq("category_id", cat.id).limit(1).single();
  console.log("SELECTED SCHEDULED EXAM:", sched);

  // Select 10 questions for this category
  const { data: qs } = await legacyClient.from("questions").select("*").eq("category_id", cat.id).limit(10);
  console.log("SELECTED 10 QUESTIONS COUNT:", qs?.length);

  const pilotSelection = {
    category: cat,
    scheduledExam: sched,
    questions: qs,
  };

  fs.writeFileSync(path.join(process.cwd(), "scratch", "pilot_selection.json"), JSON.stringify(pilotSelection, null, 2));
  console.log("Pilot selection saved to scratch/pilot_selection.json");
}

selectPilot().catch(console.error);
