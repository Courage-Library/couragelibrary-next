function parseCSV(rawText) {
  const text = rawText.trim();
  if (!text) return { data: [], fields: [], errors: ["Empty CSV input provided."] };

  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
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

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return { data: [], fields: [], errors: ["No valid rows found in CSV."] };

  const fields = rows[0].map((h) => h.toLowerCase().replace(/^["']|["']$/g, "").trim());
  const data = [];

  for (let r = 1; r < rows.length; r++) {
    const rowValues = rows[r];
    const record = {};
    for (let f = 0; f < fields.length; f++) {
      record[fields[f]] = rowValues[f] !== undefined ? rowValues[f] : "";
    }
    data.push(record);
  }

  return { data, fields, errors: [] };
}

console.log("============================================================");
console.log("COURAGE LIBRARY QUESTION BULK IMPORTER ACCEPTANCE TEST");
console.log("============================================================\n");

// 1. Test CSV with multi-line question and double quotes
const sampleCSV = `question_text,options,options_type,correct_answer,difficulty,topic,explanation,category_id,pattern_section_id,section_name,question_image,pyq_year,pyq_source,is_active,language
"What is the capital of India?","{""A"":""Mumbai"",""B"":""New Delhi"",""C"":""Chennai"",""D"":""Kolkata""}",text,B,easy,"Indian Geography","New Delhi became the capital of India in 1911 during British rule.","ab7e7e9c-cf88-44ac-9fe1-52490e2a7c27","59b581cb-63df-498c-9a41-2a62372c050a","General Awareness","",,"","",true,english
"Who composed the Indian national song 'Vande Mataram'?","{""A"":""Bankim Chandra Chattopadhyay"",""B"":""Rabindranath Tagore"",""C"":""Sarojini Naidu"",""D"":""Sri Aurobindo""}",text,A,easy,"Indian History","Vande Mataram was written by Bankim Chandra Chattopadhyay in his 1882 novel Anandamath.","ab7e7e9c-cf88-44ac-9fe1-52490e2a7c27","59b581cb-63df-498c-9a41-2a62372c050a","General Awareness","",2022,"SSC CGL",true,english
"Which of the following figures completes the pattern?
Select the most suitable option.","{""A"":""https://example.com/q1_A.png"",""B"":""https://example.com/q1_B.png"",""C"":""https://example.com/q1_C.png"",""D"":""https://example.com/q1_D.png""}",image,C,medium,"Pattern Completion","Option C correctly completes the symmetrical quadrant.","ab7e7e9c-cf88-44ac-9fe1-52490e2a7c27","59b581cb-63df-498c-9a41-2a62372c050a","General Intelligence","https://example.com/q1_fig.png",2023,"SSC GD",true,english`;

// Test 1: Parser handles 15 columns and multi-line row
const parsed = parseCSV(sampleCSV);
console.log(`[TEST 1] CSV Parser row count: ${parsed.data.length} (Expected: 3)`);
if (parsed.data.length !== 3) throw new Error("Parser failed to extract 3 rows");
console.log(`✓ Fields extracted: ${parsed.fields.length} columns: ${parsed.fields.join(", ")}`);

// Test 2: Verify JSON options unescaping
const row1 = parsed.data[0];
const optionsObj1 = JSON.parse(row1.options);
console.log(`[TEST 2] Row 1 Options A-D keys verified:`, Object.keys(optionsObj1));
if (optionsObj1.B !== "New Delhi") throw new Error("JSON options failed to unescape correctly");
console.log("✓ Options unescaped cleanly:", optionsObj1);

// Test 3: Verify Image Option URLs
const row3 = parsed.data[2];
const optionsObj3 = JSON.parse(row3.options);
console.log(`[TEST 3] Row 3 Image Options verified:`, optionsObj3);
if (optionsObj3.C !== "https://example.com/q1_C.png") throw new Error("Image option URL mismatch");
console.log("✓ Image option parsed successfully.");

// Test 4: Multi-line question preserved
console.log(`[TEST 4] Multi-line question statement:`);
console.log(`"""\n${row3.question_text}\n"""`);
if (!row3.question_text.includes("\n")) throw new Error("Multi-line newline was lost");
console.log("✓ Multi-line question formatting preserved.");

console.log("\n============================================================");
console.log("ALL QUESTION BULK IMPORTER VALIDATIONS PASSED CLEANLY!");
console.log("============================================================\n");
