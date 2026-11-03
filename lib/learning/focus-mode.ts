/**
 * COURSE-UX-1 focus mode (R13): remembered on this device only (localStorage, never sent anywhere). Shared by the
 * server page (the inline script that restores it before paint — no flash, no layout shift) and the client toggle.
 */
export const FOCUS_KEY = "cl.reader.focus";

export function focusModeScript(rootId: string): string {
  return `try{if(localStorage.getItem(${JSON.stringify(FOCUS_KEY)})==="on")document.getElementById(${JSON.stringify(rootId)}).dataset.focus="on"}catch(e){}`;
}
