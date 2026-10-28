/**
 * GEN-CHECK-1: tolerant extraction + precise diagnosis of a pasted AI answer (lesson, translation, syllabus intake).
 * Pure; safe in client components; linear time (no regex backtracking on big pastes).
 *   - strips code fences and leading / trailing prose and takes the ONE top-level JSON object → a notice
 *     "extra text was removed" (nothing inside the JSON is ever guessed or repaired)
 *   - the answer ends before its last "}" → CUT_OFF ("the answer looks cut off — ask the AI for the next part")
 *   - a JSON syntax error → its line:column and a short snippet
 *   - two objects pasted together → MULTIPLE ("paste one part at a time")
 */
export type Extracted =
  | { ok: true; json: string; data: unknown; removedText: boolean; notice: string | null }
  | { ok: false; code: "EMPTY" | "NO_JSON" | "CUT_OFF" | "MULTIPLE" | "INVALID_JSON"; message: string; line?: number; column?: number; snippet?: string };

export const PASTE_MAX_BYTES = 400 * 1024;

/** line + column (1-based) of a character offset. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return { line, column: offset - last };
}

/** A short one-line snippet around an offset, with a caret marker. */
export function snippetAt(text: string, offset: number): string {
  const a = Math.max(0, offset - 40);
  const b = Math.min(text.length, offset + 40);
  return `${a > 0 ? "…" : ""}${text.slice(a, offset)}⟦here⟧${text.slice(offset, b)}${b < text.length ? "…" : ""}`.replace(/\s+/g, " ");
}

/** The offset of a JSON.parse error (V8 "at position N" or "(line L column C)"), else null. */
export function jsonErrorOffset(text: string, message: string): number | null {
  const pos = /position (\d+)/.exec(message);
  if (pos) return Math.min(Number(pos[1]), text.length);
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) {
    let line = 1;
    let i = 0;
    for (; i < text.length && line < Number(lc[1]); i++) if (text.charCodeAt(i) === 10) line++;
    return Math.min(i + Number(lc[2]) - 1, text.length);
  }
  return null;
}

/**
 * The offset of the first JSON syntax error (linear; iterative, no recursion), or null when the text is valid. Needed
 * because V8 (Node 20+, Chrome) no longer always puts the position in JSON.parse messages ("Unexpected token ',', … is
 * not valid JSON").
 */
export function syntaxErrorOffset(text: string): number | null {
  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n && (text[i] === " " || text[i] === "\n" || text[i] === "\r" || text[i] === "\t")) i++;
  };
  const str = (): boolean => {
    i++; // opening quote
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) { i++; return true; }
      if (c < 32) return false;
      if (c === 92) {
        const e = text[i + 1];
        if (e === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { i += 2; return false; }
          i += 6;
        } else if (e !== undefined && '"\/bfnrt'.includes(e)) i += 2;
        else { i++; return false; }
      } else i++;
    }
    return false;
  };
  const scalar = (): boolean => {
    for (const w of ["true", "false", "null"]) if (text.startsWith(w, i)) { i += w.length; return true; }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) return false;
    i += m[0].length;
    return true;
  };
  // stack of open containers: "{" or "["; `expect` is what may come next
  const stack: string[] = [];
  let expect: "value" | "key" | "after" = "value";
  let first = false; // just after "{" / "[" (a closing bracket is allowed)
  for (;;) {
    ws();
    if (expect === "value") {
      if (i >= n) return i;
      const c = text[i];
      if (first && c === "]" && stack[stack.length - 1] === "[") { i++; stack.pop(); expect = "after"; first = false; continue; }
      first = false;
      if (c === "{") { stack.push("{"); i++; expect = "key"; first = true; continue; }
      if (c === "[") { stack.push("["); i++; expect = "value"; first = true; continue; }
      if (c === '"') { if (!str()) return i; expect = "after"; continue; }
      if (!scalar()) return i;
      expect = "after";
      continue;
    }
    if (expect === "key") {
      if (i >= n) return i;
      if (first && text[i] === "}") { i++; stack.pop(); expect = "after"; first = false; continue; }
      first = false;
      if (text[i] !== '"' || !str()) return i;
      ws();
      if (text[i] !== ":") return i;
      i++;
      expect = "value";
      continue;
    }
    // after a value
    if (!stack.length) return i >= n ? null : i;
    if (i >= n) return i;
    const top = stack[stack.length - 1];
    if (text[i] === ",") { i++; expect = top === "{" ? "key" : "value"; continue; }
    if ((top === "{" && text[i] === "}") || (top === "[" && text[i] === "]")) { i++; stack.pop(); continue; }
    return i;
  }
}

/** Scans from `start` (a "{") and returns the index of its matching "}" (strings + escapes aware), or -1 when cut off. */
function matchObject(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (ch === 92) i++; // backslash: skip the escaped character
      else if (ch === 34) inString = false;
      continue;
    }
    if (ch === 34) inString = true;
    else if (ch === 123 || ch === 91) depth++;
    else if (ch === 125 || ch === 93) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractJson(input: string): Extracted {
  const text = String(input ?? "");
  if (!text.trim()) return { ok: false, code: "EMPTY", message: "Paste the assistant's JSON answer first." };
  if (new TextEncoder().encode(text).length > PASTE_MAX_BYTES) return { ok: false, code: "NO_JSON", message: `The paste is larger than ${PASTE_MAX_BYTES / 1024} KB. Ask the assistant to split the answer into parts.` };
  const start = text.indexOf("{");
  if (start < 0) return { ok: false, code: "NO_JSON", message: "No JSON object was found in the paste. Paste the assistant's JSON answer (it starts with \"{\")." };
  const end = matchObject(text, start);
  if (end < 0) {
    const lc = lineColumn(text, text.length);
    return { ok: false, code: "CUT_OFF", message: `The answer looks cut off: it ends before its last "}" (line ${lc.line}). Ask the assistant for the next part ("next part") or to finish the answer, then paste it.`, line: lc.line, column: lc.column, snippet: snippetAt(text, text.length) };
  }
  const before = text.slice(0, start);
  const after = text.slice(end + 1);
  if (after.includes("{") && matchObject(after, after.indexOf("{")) >= 0) {
    return { ok: false, code: "MULTIPLE", message: "The paste holds more than one JSON object. Paste one answer (or one part) at a time." };
  }
  const json = text.slice(start, end + 1);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    const off = syntaxErrorOffset(json) ?? jsonErrorOffset(json, String(e instanceof Error ? e.message : e)) ?? 0;
    const lc = lineColumn(text, start + off);
    return { ok: false, code: "INVALID_JSON", message: `This is not valid JSON at line ${lc.line}, column ${lc.column}.`, line: lc.line, column: lc.column, snippet: snippetAt(json, off) };
  }
  const removedText = Boolean(before.trim() || after.trim());
  return { ok: true, json, data, removedText, notice: removedText ? "Extra text around the JSON was removed (code fences or notes from the assistant)." : null };
}

/** "$.blocks[12].options[0].feedback" → "block 13 (id "qc-3") · options[0].feedback" for messages. */
export function describeBlockPath(path: string, blocks: unknown): string {
  const m = /^\$\.blocks\[(\d+)\](.*)$/.exec(path);
  if (!m || !Array.isArray(blocks)) return path;
  const b = blocks[Number(m[1])] as { id?: unknown } | undefined;
  const id = b && typeof b.id === "string" ? ` (id "${b.id}")` : "";
  return `block ${Number(m[1]) + 1}${id}${m[2] ? ` · ${m[2].replace(/^\./, "")}` : ""}`;
}
