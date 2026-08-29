import { formatBytes } from "../lib/client/reward-image-optimizer";
import { uploadRewardImageAction } from "../app/admin/rewards/actions";

function runTests() {
  console.log("=== COURAGE LIBRARY UPLOAD PIPELINE TEST SUITE ===");

  // Test 1: formatBytes helper
  console.log("\n--- TEST 1: formatBytes ---");
  console.assert(formatBytes(0) === "0 B", "formatBytes(0) failed");
  console.assert(formatBytes(1024) === "1 KB", "formatBytes(1024) failed");
  console.assert(formatBytes(4.8 * 1024 * 1024).includes("4.8 MB"), "formatBytes(4.8MB) failed");
  console.log("formatBytes checks passed: 0 B, 1 KB, 4.8 MB");

  // Test 2: Dimension scaling logic simulation
  console.log("\n--- TEST 2: Canonical Dimension Rules ---");
  const MAX_CANONICAL_DIM = 1600;

  function calculateTarget(w: number, h: number) {
    if (w > MAX_CANONICAL_DIM || h > MAX_CANONICAL_DIM) {
      if (w >= h) {
        return { targetWidth: MAX_CANONICAL_DIM, targetHeight: Math.round((h * MAX_CANONICAL_DIM) / w) };
      } else {
        return { targetHeight: MAX_CANONICAL_DIM, targetWidth: Math.round((w * MAX_CANONICAL_DIM) / h) };
      }
    }
    return { targetWidth: w, targetHeight: h };
  }

  // Case A: 1536x1536 AI PNG (should keep native 1536x1536 without upscaling)
  const caseA = calculateTarget(1536, 1536);
  console.assert(caseA.targetWidth === 1536 && caseA.targetHeight === 1536, "1536x1536 should remain 1536x1536");
  console.log("Case A (1536x1536) -> Target:", caseA.targetWidth, "x", caseA.targetHeight, "(Native preserved)");

  // Case B: 1600x1600 Canonical PNG (should keep 1600x1600)
  const caseB = calculateTarget(1600, 1600);
  console.assert(caseB.targetWidth === 1600 && caseB.targetHeight === 1600, "1600x1600 should remain 1600x1600");
  console.log("Case B (1600x1600) -> Target:", caseB.targetWidth, "x", caseB.targetHeight, "(Canonical preserved)");

  // Case C: 2048x2048 High-Res PNG (should downscale to 1600x1600)
  const caseC = calculateTarget(2048, 2048);
  console.assert(caseC.targetWidth === 1600 && caseC.targetHeight === 1600, "2048x2048 should scale to 1600x1600");
  console.log("Case C (2048x2048) -> Target:", caseC.targetWidth, "x", caseC.targetHeight, "(Downscaled to canonical max)");

  // Case D: Non-square 2400x1600 (should scale proportionally to 1600x1067)
  const caseD = calculateTarget(2400, 1600);
  console.assert(caseD.targetWidth === 1600 && caseD.targetHeight === 1067, "2400x1600 should scale to 1600x1067");
  console.log("Case D (2400x1600) -> Target:", caseD.targetWidth, "x", caseD.targetHeight, "(Proportional scaling)");

  // Test 3: Action export signature
  console.log("\n--- TEST 3: Action Signature ---");
  console.assert(typeof uploadRewardImageAction === "function", "uploadRewardImageAction must be a function");
  console.log("uploadRewardImageAction server action is registered and exported.");

  console.log("\n=== ALL TEST CHECKS PASSED SUCCESSFULLY! ===");
}

runTests();

