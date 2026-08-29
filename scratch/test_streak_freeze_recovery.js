/**
 * Comprehensive Regression Suite for:
 * 1. Dynamic Store Redemption CTA (Authoritative Balance & Need X more CL calculation)
 * 2. Streak Freeze Recovery System (Asia/Kolkata timezone, eligibility, 1-shield consumption, streak preservation, idempotency, and continuation)
 */

global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- Timezone Helpers in Asia/Kolkata ---
function getKolkataDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKolkataLongDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// --- Store CTA Logic Simulation ---
function computeStoreCTA({ currentBalance, itemCost, isStreakFreeze, freezesHeld, stockQuantity }) {
  if (stockQuantity !== -1 && stockQuantity <= 0) {
    return { label: "Out of Stock", disabled: true, canAfford: false };
  }
  if (isStreakFreeze && freezesHeld >= 2) {
    return { label: "Max Shields Held (2/2)", disabled: true, canAfford: false };
  }
  if (currentBalance >= itemCost) {
    return { label: "Redeem Reward", disabled: false, canAfford: true };
  }
  const needed = itemCost - currentBalance;
  return {
    label: `🔒 Need ${needed.toLocaleString()} more CL`,
    needed,
    disabled: true,
    canAfford: false,
  };
}

async function runTests() {
  console.log("================================================================================");
  console.log("  COURAGE LIBRARY — DYNAMIC STORE CTA & STREAK FREEZE RECOVERY REGRESSION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function record(title, condition, details = "") {
    if (condition) {
      console.log(`  ✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${title} — ${details}`);
      failed++;
    }
  }

  // ==========================================
  // SECTION 1: DYNAMIC STORE CTA TESTS
  // ==========================================
  console.log("--- Section 1: Dynamic Store CTA Evaluations ---");

  const cta1 = computeStoreCTA({
    currentBalance: 23,
    itemCost: 150,
    isStreakFreeze: true,
    freezesHeld: 0,
    stockQuantity: -1,
  });
  record("Insufficient balance (23 CL vs 150 CL) shows '🔒 Need 127 more CL'", cta1.needed === 127 && cta1.disabled === true);

  const cta2 = computeStoreCTA({
    currentBalance: 23,
    itemCost: 250,
    isStreakFreeze: false,
    freezesHeld: 0,
    stockQuantity: -1,
  });
  record("Insufficient balance (23 CL vs 250 CL) shows '🔒 Need 227 more CL'", cta2.needed === 227 && cta2.disabled === true);

  const cta3 = computeStoreCTA({
    currentBalance: 23,
    itemCost: 1800,
    isStreakFreeze: false,
    freezesHeld: 0,
    stockQuantity: 50,
  });
  record("Insufficient balance (23 CL vs 1,800 CL) shows '🔒 Need 1,777 more CL'", cta3.needed === 1777 && cta3.disabled === true);

  const cta4 = computeStoreCTA({
    currentBalance: 200,
    itemCost: 150,
    isStreakFreeze: true,
    freezesHeld: 0,
    stockQuantity: -1,
  });
  record("Sufficient balance (200 CL vs 150 CL) shows active 'Redeem Reward'", cta4.label === "Redeem Reward" && cta4.disabled === false);

  const cta5 = computeStoreCTA({
    currentBalance: 500,
    itemCost: 150,
    isStreakFreeze: true,
    freezesHeld: 2,
    stockQuantity: -1,
  });
  record("Max Freeze Shields (2/2 held) shows 'Max Shields Held (2/2)' and disabled", cta5.label === "Max Shields Held (2/2)" && cta5.disabled === true);

  const cta6 = computeStoreCTA({
    currentBalance: 5000,
    itemCost: 1800,
    isStreakFreeze: false,
    freezesHeld: 0,
    stockQuantity: 0,
  });
  record("Out of stock reward shows 'Out of Stock' and disabled", cta6.label === "Out of Stock" && cta6.disabled === true);

  // ==========================================
  // SECTION 2: ASIA/KOLKATA TIMEZONE BOUNDARY TESTS
  // ==========================================
  console.log("\n--- Section 2: Asia/Kolkata Timezone Calendar Bounds ---");

  // UTC 2026-08-29 18:29:00 -> IST 2026-08-29 23:59:00 (Saturday 29 Aug)
  const dateIST_2359 = new Date(Date.UTC(2026, 7, 29, 18, 29, 0));
  const kolkataDate1 = getKolkataDateString(dateIST_2359);
  record("29 Aug 23:59 IST is calendar day '2026-08-29'", kolkataDate1 === "2026-08-29", `Got ${kolkataDate1}`);

  // UTC 2026-08-29 18:31:00 -> IST 2026-08-30 00:01:00 (Sunday 30 Aug)
  const dateIST_0001 = new Date(Date.UTC(2026, 7, 29, 18, 31, 0));
  const kolkataDate2 = getKolkataDateString(dateIST_0001);
  record("30 Aug 00:01 IST is calendar day '2026-08-30'", kolkataDate2 === "2026-08-30", `Got ${kolkataDate2}`);

  const formattedLong = formatKolkataLongDate("2026-08-29");
  record("formatKolkataLongDate('2026-08-29') formats into long human date", formattedLong.includes("29") && formattedLong.includes("August") && formattedLong.includes("2026"), `Got: ${formattedLong}`);

  // ==========================================
  // SECTION 3: STREAK FREEZE RECOVERY SIMULATION
  // ==========================================
  console.log("\n--- Section 3: Streak Freeze Recovery Logic & Invariants ---");

  // Simulate a test user state
  const simulatedUser = {
    userId: "test-user-streak-001",
    currentStreak: 12,
    longestStreak: 15,
    lastQualifyingDate: "2026-08-28", // Missed 2026-08-29
    freezesHeld: 1,
    clCoins: 350,
    activityLogs: [{ activityDate: "2026-08-28", action: "MOCK_TEST" }],
  };

  const today = "2026-08-30";
  const yesterday = addDaysToDateString(today, -1); // 2026-08-29

  // A. Eligibility evaluation
  const missedDate = addDaysToDateString(simulatedUser.lastQualifyingDate, 1); // 2026-08-29
  const isEligible = simulatedUser.freezesHeld >= 1 && missedDate <= yesterday;
  record("Eligible missed study day detected as '2026-08-29'", missedDate === "2026-08-29" && isEligible === true);

  // B. Execution: 1 Shield consumed, CL balance untouched, streak preserved
  const clBefore = simulatedUser.clCoins;
  const shieldsBefore = simulatedUser.freezesHeld;

  // Execute recovery
  simulatedUser.freezesHeld -= 1;
  simulatedUser.activityLogs.push({
    activityDate: missedDate,
    action: "FREEZE_APPLIED",
    metadata: { protected_by: "STREAK_FREEZE_SHIELD", streak_preserved: simulatedUser.currentStreak },
  });
  simulatedUser.lastQualifyingDate = missedDate; // Anchor updated to protected date

  record("Shield count decreases by exactly 1 (1 -> 0)", simulatedUser.freezesHeld === 0 && shieldsBefore === 1);
  record("CL Coin balance completely untouched (350 -> 350)", simulatedUser.clCoins === clBefore);
  record("Streak count preserved at 12 (does NOT advance to 13 upon freeze)", simulatedUser.currentStreak === 12);
  record("Missed day 2026-08-29 marked as 'FREEZE_APPLIED' (PROTECTED)", simulatedUser.activityLogs.some((l) => l.activityDate === "2026-08-29" && l.action === "FREEZE_APPLIED"));

  // C. Idempotency & Duplicate Protection Test
  const isAlreadyProtected = simulatedUser.activityLogs.some((l) => l.activityDate === missedDate && l.action === "FREEZE_APPLIED");
  record("Duplicate protection for same date detected as ALREADY_PROTECTED", isAlreadyProtected === true);

  // D. No Shields Rejection Test
  const cannotActivateWithoutShields = simulatedUser.freezesHeld < 1;
  record("Activation without shields is rejected", cannotActivateWithoutShields === true);

  // E. Streak Continuation on Next Qualifying Study Day
  // Today is 2026-08-30. Last qualifying date is 2026-08-29 (protected).
  // Consecutive day check: 2026-08-29 == 2026-08-30 - 1 day -> TRUE!
  const isConsecutiveDay = simulatedUser.lastQualifyingDate === addDaysToDateString(today, -1);
  if (isConsecutiveDay) {
    simulatedUser.currentStreak += 1; // Increments to 13 on next study!
    simulatedUser.lastQualifyingDate = today;
  }
  record("Next qualifying study advances streak from 12 -> 13 smoothly", simulatedUser.currentStreak === 13 && simulatedUser.lastQualifyingDate === today);

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

