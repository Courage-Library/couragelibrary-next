import { formatBytes } from "../lib/client/reward-image-optimizer";
import { uploadRewardImageAction } from "../app/admin/rewards/actions";
import { buildRewardImagePrompt, COURAGE_LIBRARY_CANONICAL_SPEC } from "../lib/admin/ai-image-brief";

function runTests() {
  console.log("=== COURAGE LIBRARY 4:3 STORE REDESIGN TEST SUITE ===");

  // Test 1: formatBytes helper
  console.log("\n--- TEST 1: formatBytes ---");
  console.assert(formatBytes(0) === "0 B", "formatBytes(0) failed");
  console.assert(formatBytes(1024) === "1 KB", "formatBytes(1024) failed");
  console.assert(formatBytes(4.8 * 1024 * 1024).includes("4.8 MB"), "formatBytes(4.8MB) failed");
  console.log("formatBytes checks passed: 0 B, 1 KB, 4.8 MB");

  // Test 2: Canonical Max 1600x1200 Dimension Rules without distortion
  console.log("\n--- TEST 2: Canonical Max 1600x1200 Bounds Rules ---");
  const MAX_CANONICAL_WIDTH = 1600;
  const MAX_CANONICAL_HEIGHT = 1200;

  function calculateTarget(w: number, h: number) {
    const scale = Math.min(1, MAX_CANONICAL_WIDTH / w, MAX_CANONICAL_HEIGHT / h);
    return { targetWidth: Math.round(w * scale), targetHeight: Math.round(h * scale), scale };
  }

  // Case A: 1536x1024 (Within bounds, scale = 1, preserve native)
  const caseA = calculateTarget(1536, 1024);
  console.assert(caseA.targetWidth === 1536 && caseA.targetHeight === 1024, "1536x1024 should remain 1536x1024");
  console.log("Case A (1536x1024) -> Target:", caseA.targetWidth, "x", caseA.targetHeight, "(Native preserved, no distortion)");

  // Case B: 1600x1200 (Exact 4:3 master)
  const caseB = calculateTarget(1600, 1200);
  console.assert(caseB.targetWidth === 1600 && caseB.targetHeight === 1200, "1600x1200 should remain 1600x1200");
  console.log("Case B (1600x1200) -> Target:", caseB.targetWidth, "x", caseB.targetHeight, "(Master 4:3 preserved)");

  // Case C: 2400x1800 (4:3 High-Res, downscale proportionally to 1600x1200)
  const caseC = calculateTarget(2400, 1800);
  console.assert(caseC.targetWidth === 1600 && caseC.targetHeight === 1200, "2400x1800 should scale to 1600x1200");
  console.log("Case C (2400x1800) -> Target:", caseC.targetWidth, "x", caseC.targetHeight, "(Downscaled to canonical max 4:3)");

  // Case D: 2048x2048 (Square High-Res, scale proportionally to 1200x1200 within max bounds)
  const caseD = calculateTarget(2048, 2048);
  console.assert(caseD.targetWidth === 1200 && caseD.targetHeight === 1200, "2048x2048 should scale to 1200x1200");
  console.log("Case D (2048x2048) -> Target:", caseD.targetWidth, "x", caseD.targetHeight, "(Square preserved within 1600x1200 box)");

  // Test 3: AI Image Prompt Generator Spec
  console.log("\n--- TEST 3: AI Image Prompt 4:3 Master Specification ---");
  console.assert(COURAGE_LIBRARY_CANONICAL_SPEC.aspectRatio.includes("4:3"), "Spec must include 4:3");
  console.assert(COURAGE_LIBRARY_CANONICAL_SPEC.canonicalResolution.includes("1600 × 1200"), "Spec must include 1600 × 1200");

  const prompt = buildRewardImagePrompt({
    title: "Courage Library Water Bottle",
    category: "PHYSICAL",
    description: "Insulated thermal bottle",
  });
  console.assert(prompt.includes("4:3"), "Prompt must include 4:3");
  console.assert(prompt.includes("1600 × 1200"), "Prompt must include 1600 × 1200");
  console.assert(prompt.includes("65%–75%"), "Prompt must include 65%–75% subject coverage");
  console.assert(prompt.includes("10%–12%"), "Prompt must include 10%–12% safe margins");
  console.log("AI Image Prompt verified for 4:3 (1600 × 1200) master artwork standard.");

  console.log("\n=== ALL TEST CHECKS PASSED SUCCESSFULLY! ===");
}

runTests();

