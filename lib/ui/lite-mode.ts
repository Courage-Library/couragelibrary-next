/**
 * BRAND-2 (decision #72) lite mode. Runs inline in <head> before first paint (app/layout.tsx) and adds `lite` to
 * <html> on low-end devices: navigator.deviceMemory <= 4 GB, hardwareConcurrency <= 4 cores, or the Save-Data
 * preference. `html.lite` turns every glass surface solid (no backdrop blur) and drops the large shadows
 * (app/globals.css). Any error leaves the page in its default look. Tiny on purpose: no imports, no globals.
 */
export const LITE_MODE_SCRIPT =
  "(function(){try{var n=navigator,c=n.connection;" +
  "if((n.deviceMemory&&n.deviceMemory<=4)||(n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(c&&c.saveData))" +
  "document.documentElement.classList.add('lite')}catch(e){}})();";

/** Pure decision used by the inline script, exported for tests (same rule, same thresholds). */
export function isLiteDevice(nav: { deviceMemory?: number; hardwareConcurrency?: number; connection?: { saveData?: boolean } }): boolean {
  return Boolean((nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || nav.connection?.saveData);
}
