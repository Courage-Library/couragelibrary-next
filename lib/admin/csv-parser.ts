/**
 * Robust RFC 4180 compliant CSV Parser for Question Bulk Importer.
 * Correctly handles multi-line fields, escaped double-quotes (""), and empty cells.
 */

export interface ParsedCSVResult {
  data: Record<string, string>[];
  fields: string[];
  errors: string[];
}

export function parseCSV(rawText: string): ParsedCSVResult {
  const text = rawText.trim();
  if (!text) {
    return { data: [], fields: [], errors: ["Empty CSV input provided."] };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
        i++;
        continue;
      } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
        i += char === "\r" ? 2 : 1;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  // Push remaining cell/row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { data: [], fields: [], errors: ["No valid rows found in CSV."] };
  }

  const fields = rows[0].map((h) => h.toLowerCase().replace(/^["']|["']$/g, "").trim());
  const data: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const rowValues = rows[r];
    const record: Record<string, string> = {};
    for (let f = 0; f < fields.length; f++) {
      record[fields[f]] = rowValues[f] !== undefined ? rowValues[f] : "";
    }
    data.push(record);
  }

  return { data, fields, errors: [] };
}
