global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const LEGACY_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const LEGACY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const legacyClient = createClient(LEGACY_URL, LEGACY_KEY);

async function safeDb(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fn();
      if (!res.error || !res.error.message?.includes("fetch failed")) {
        return res;
      }
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return await fn();
}

const POTENTIAL_LEGACY_TABLES = [
  "exam_categories",
  "exam_patterns",
  "pattern_sections",
  "questions",
  "scheduled_exams",
  "coaching_centers",
  "coaching_batches",
  "coaching_students",
  "attempts",
  "attempt_questions",
  "answers",
  "user_profiles",
  "user_exam_enrollments",
  "user_wallet",
  "coin_transactions",
  "reported_questions",
  "waitlist",
];

async function runLegacyInventory() {
  console.log("=== EXECUTING READ-ONLY LEGACY DATABASE AUDIT ===");
  const results = {};

  for (const table of POTENTIAL_LEGACY_TABLES) {
    try {
      const { count, data, error } = await safeDb(() =>
        legacyClient.from(table).select("*", { count: "exact", head: false }).limit(5)
      );

      if (error) {
        results[table] = { status: "error", message: error.message };
      } else {
        results[table] = {
          status: "ok",
          count,
          sampleColumns: data && data.length > 0 ? Object.keys(data[0]) : [],
          sampleRows: data || [],
        };
      }
    } catch (err) {
      results[table] = { status: "exception", message: err.message };
    }
  }

  const outPath = path.join(process.cwd(), "scratch", "legacy_raw_inventory.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("Inventory written to scratch/legacy_raw_inventory.json");
}

runLegacyInventory().catch(console.error);
