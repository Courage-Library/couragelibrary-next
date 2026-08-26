global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const LEGACY_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const LEGACY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const legacyClient = createClient(LEGACY_URL, LEGACY_KEY);

const CANDIDATE_NAMES = [
  "exam_categories", "categories", "exam_patterns", "patterns", "pattern_sections", "sections",
  "questions", "question_options", "scheduled_exams", "schedules", "mock_tests", "mock_templates",
  "attempts", "test_attempts", "attempt_questions", "answers", "attempt_answers", "user_profiles",
  "profiles", "user_exam_enrollments", "enrollments", "coaching_centers", "coachings",
  "coaching_batches", "coaching_students", "wallet", "user_wallet", "coin_transactions",
  "reported_questions", "waitlist", "subjects", "topics", "feedback", "results", "test_results"
];

async function checkAll() {
  const summary = {};
  for (const name of CANDIDATE_NAMES) {
    try {
      const { count, error, data } = await legacyClient.from(name).select("*", { count: "exact", head: false }).limit(2);
      if (!error) {
        summary[name] = { count, columns: data && data[0] ? Object.keys(data[0]) : [] };
      }
    } catch (e) {}
  }
  console.log("ALL LEGACY TABLES DISCOVERED:", JSON.stringify(summary, null, 2));
}

checkAll().catch(console.error);
