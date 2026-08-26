"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AdminCategoryItem,
  AdminSectionItem,
} from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  uploadBulkImportImageAction,
  importBulkQuestionsAction,
  BulkImportQuestionRecord,
} from "@/app/admin/actions";
import { parseCSV } from "@/lib/admin/csv-parser";
import {
  Wand2,
  Image as ImageIcon,
  FileSpreadsheet,
  Copy,
  Check,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Database,
  ArrowLeft,
  ArrowRight,
  X,
  Lightbulb,
  Info,
  Loader2,
  Tag,
  RotateCcw,
} from "lucide-react";

interface Props {
  categories: AdminCategoryItem[];
  sections: AdminSectionItem[];
}

const REQUIRED_COLS = [
  "question_text",
  "options",
  "correct_answer",
  "difficulty",
  "topic",
  "category_id",
  "pattern_section_id",
];

const ALL_COLS = [
  "question_text",
  "options",
  "options_type",
  "correct_answer",
  "difficulty",
  "topic",
  "explanation",
  "category_id",
  "pattern_section_id",
  "section_name",
  "question_image",
  "pyq_year",
  "pyq_source",
  "is_active",
  "language",
];

// Full Exam Benchmark calibration dictionary matching legacy bulkImport.html
const EXAM_BENCHMARKS: Record<string, { profile: string; easy: string; medium: string; hard: string }> = {
  // SSC
  "ssc gd": {
    profile: "10th pass candidates, basic academic level, rural/semi-urban background",
    easy: "Direct recall or single-step problems. Standard 10th level. Most SSC GD aspirants solve in under 30 seconds.",
    medium: "Requires 2-3 steps or moderate reasoning. Needs some preparation. Aspirant takes about 1 minute.",
    hard: "Multi-step logic, tricky wording, or concepts uncommon at this level. Even well-prepared aspirants may struggle.",
  },
  "ssc cgl": {
    profile: "Graduate level candidates, moderate to high aptitude, competitive exam",
    easy: "Direct formula application or basic concept recall. Any prepared CGL aspirant solves in under 45 seconds.",
    medium: "Solid conceptual understanding needed. 2-3 step solving. Average aspirant takes 1-1.5 minutes.",
    hard: "Complex multi-step, advanced concepts, or time-consuming. Only well-prepared aspirants solve confidently.",
  },
  "ssc chsl": {
    profile: "12th pass candidates, moderate level, LDC/DEO/PA posts",
    easy: "Basic recall or single-step at 12th level. Standard knowledge sufficient.",
    medium: "Needs preparation beyond 12th. Moderate reasoning or 2-step calculation.",
    hard: "Advanced for 12th level. Requires deep preparation and careful analysis.",
  },
  "ssc cpo": {
    profile: "Graduate candidates for SI/ASI posts, physical + written exam",
    easy: "Direct GK recall or basic reasoning. Standard graduate level.",
    medium: "Moderate aptitude and awareness needed. 2-step problems.",
    hard: "Tricky reasoning or advanced GK. Requires dedicated preparation.",
  },
  "ssc mts": {
    profile: "10th pass candidates, entry level, basic academic standard",
    easy: "Very basic recall or arithmetic. 8th-10th level knowledge sufficient.",
    medium: "Simple reasoning or 2-step arithmetic at 10th level.",
    hard: "Moderate difficulty for MTS level — equivalent to easy for CGL.",
  },
  "ssc je": {
    profile: "Diploma/Graduate engineers, technical knowledge required",
    easy: "Direct formula or basic concept from diploma syllabus. Straightforward.",
    medium: "Application of engineering concepts. Standard diploma-level problem.",
    hard: "Multi-concept application or advanced engineering problem.",
  },
  "ssc steno": {
    profile: "12th pass candidates, focus on English and reasoning",
    easy: "Basic English grammar or direct reasoning. 12th level.",
    medium: "Moderate English comprehension or 2-step reasoning.",
    hard: "Advanced vocabulary, complex comprehension, or tricky reasoning.",
  },

  // RAILWAY
  "rrb ntpc": {
    profile: "12th/Graduate candidates for clerical and commercial posts",
    easy: "Direct recall or basic calculation at 12th level. Common GK questions.",
    medium: "Moderate reasoning or standard formula-based problems. Needs preparation.",
    hard: "Tricky multi-step or advanced for NTPC level. Requires strong preparation.",
  },
  ntpc: {
    profile: "12th/Graduate candidates for Railway NTPC posts",
    easy: "Direct recall or single-step problems within 12th level syllabus.",
    medium: "Moderate difficulty needing 2-3 step reasoning or calculation.",
    hard: "Complex for NTPC level. Needs strong preparation.",
  },
  "rrb group d": {
    profile: "10th pass candidates for Group D posts, basic level",
    easy: "Very basic arithmetic, science, GK at 10th level. Direct recall.",
    medium: "Moderate 10th level reasoning or 2-step arithmetic.",
    hard: "Challenging for Group D level — equivalent to medium for NTPC.",
  },
  "rrb alp": {
    profile: "10th pass + ITI candidates for Assistant Loco Pilot, technical focus",
    easy: "Basic trade knowledge or direct recall. ITI level technical questions.",
    medium: "Application of technical trade concepts. 2-step problems.",
    hard: "Advanced technical or multi-concept application for ALP level.",
  },
  "rrb je": {
    profile: "Diploma engineers for Junior Engineer posts in Railways",
    easy: "Direct formula or basic engineering concept from diploma syllabus.",
    medium: "Standard diploma-level engineering application problem.",
    hard: "Multi-concept or advanced engineering for JE level.",
  },
  "rrb paramedical": {
    profile: "Paramedical diploma/degree candidates for health posts in Railways",
    easy: "Direct medical/health knowledge recall. Standard paramedical level.",
    medium: "Applied medical knowledge. 2-step clinical reasoning.",
    hard: "Advanced paramedical concepts or tricky clinical scenarios.",
  },
  "rrb ministerial": {
    profile: "Graduate candidates for ministerial and isolated posts",
    easy: "Basic GK, reasoning, English at graduate level.",
    medium: "Moderate aptitude and awareness. Standard graduate level.",
    hard: "Competitive level — tricky reasoning or advanced questions.",
  },
  railway: {
    profile: "Railway exam candidates (10th/12th/Graduate depending on post)",
    easy: "Direct knowledge or basic calculation. General awareness easy for anyone following news.",
    medium: "Requires preparation. Moderate reasoning or standard formula problems.",
    hard: "Tricky or multi-step. Requires dedicated preparation.",
  },

  // BANKING
  "ibps po": {
    profile: "Graduate candidates for Probationary Officer, high competition",
    easy: "Standard banking prelims level. Well-prepared aspirant solves in under 45 seconds.",
    medium: "Mains level difficulty. Solid quantitative/verbal skills needed. 1-2 minutes.",
    hard: "High-level DI, complex reasoning, or advanced English. Only top aspirants solve.",
  },
  "ibps clerk": {
    profile: "Graduate candidates for Clerical Cadre, moderate competition",
    easy: "Basic banking prelims level. Direct formula or recall.",
    medium: "Moderate aptitude needed. Standard clerical level problem.",
    hard: "Challenging for clerk level. Multi-step or tricky.",
  },
  "ibps so": {
    profile: "Graduate/Specialist candidates for Specialist Officer posts",
    easy: "Direct specialist knowledge or basic aptitude. Standard SO level.",
    medium: "Applied specialist knowledge. Moderate aptitude problems.",
    hard: "Advanced specialist or high-level aptitude. Only strong aspirants solve.",
  },
  "ibps rrb": {
    profile: "Graduate candidates for Regional Rural Banks, moderate level",
    easy: "Basic banking aptitude or GK. Direct recall.",
    medium: "Moderate reasoning or arithmetic. Standard RRB level.",
    hard: "Competitive level for RRB. Multi-step problems.",
  },
  ibps: {
    profile: "Graduate candidates for banking exams, high aptitude required",
    easy: "Standard banking prelims formula questions. Prepared aspirant solves in under 45 seconds.",
    medium: "Requires solid quantitative/verbal skills. 1-2 minutes for a prepared aspirant.",
    hard: "High-level DI, complex reasoning, or advanced English. Only top aspirants solve.",
  },
  "sbi po": {
    profile: "Graduate candidates for SBI PO, highly competitive exam",
    easy: "Standard SBI prelims level. Direct application of concepts.",
    medium: "Mains level. Strong conceptual clarity needed.",
    hard: "Challenging even for top SBI aspirants. Multi-step or very tricky.",
  },
  "sbi clerk": {
    profile: "Graduate candidates for SBI Junior Associates, moderate level",
    easy: "Basic SBI prelims level. Direct recall or formula.",
    medium: "Moderate reasoning or arithmetic. Standard clerk level.",
    hard: "Competitive for clerk level. Tricky or multi-step.",
  },
  sbi: {
    profile: "Graduate candidates for SBI exams, competitive and high level",
    easy: "Direct application questions. Standard SBI prelims level.",
    medium: "Mains level difficulty. Needs strong conceptual clarity.",
    hard: "Challenging even for top SBI aspirants. Multi-step or tricky.",
  },
  "rbi grade b": {
    profile: "Graduate/Post-graduate candidates for RBI Grade B, very high level",
    easy: "Standard banking/economy concept. Any RBI aspirant knows this.",
    medium: "Requires deep economic/financial knowledge or complex aptitude.",
    hard: "Advanced economics, finance, or very complex reasoning. Elite level.",
  },
  "rbi assistant": {
    profile: "Graduate candidates for RBI Assistant, moderate-high level",
    easy: "Basic banking awareness or aptitude. Prelims level.",
    medium: "Moderate reasoning or economy awareness. Mains level.",
    hard: "Advanced for RBI Assistant level. Requires strong preparation.",
  },
  rbi: {
    profile: "Graduate candidates for RBI exams",
    easy: "Basic banking/economy concept recall. Prelims level.",
    medium: "Moderate financial/aptitude knowledge needed.",
    hard: "Advanced economics or complex reasoning. Competitive level.",
  },
  niacl: {
    profile: "Graduate candidates for insurance sector exams",
    easy: "Basic insurance awareness or aptitude. Direct recall.",
    medium: "Moderate aptitude or insurance knowledge.",
    hard: "Advanced for insurance exam level.",
  },
  lic: {
    profile: "Graduate candidates for LIC AAO/ADO, insurance focus",
    easy: "Basic insurance/financial awareness. Direct recall.",
    medium: "Moderate aptitude and insurance awareness.",
    hard: "Complex reasoning or advanced insurance concepts.",
  },

  // DEFENCE
  nda: {
    profile: "12th pass candidates (PCM) for National Defence Academy, high level",
    easy: "Direct 11th-12th PCM concept or basic GK. Any prepared NDA aspirant knows this.",
    medium: "Requires solid 11th-12th Maths/Science understanding. 2-3 step problems.",
    hard: "Advanced PCM application or tricky reasoning. Only well-prepared aspirants solve.",
  },
  cds: {
    profile: "Graduate candidates for Combined Defence Services, moderate-high level",
    easy: "Basic GK, English, or arithmetic at graduate level. Direct recall.",
    medium: "Moderate reasoning, English comprehension, or 2-step arithmetic.",
    hard: "Advanced English, complex reasoning, or tricky maths. Competitive level.",
  },
  afcat: {
    profile: "Graduate candidates for Air Force Common Admission Test, high level",
    easy: "Direct GK or basic reasoning/verbal. Standard graduate level.",
    medium: "Moderate verbal ability, reasoning, or numerical. 2-step problems.",
    hard: "Advanced for AFCAT level. Complex reasoning or tough GK.",
  },
  agniveer: {
    profile: "10th/12th pass candidates for Agnipath scheme (Army/Navy/Air Force)",
    easy: "Basic 10th-12th level recall. Simple arithmetic or GK.",
    medium: "Moderate 12th level. Needs some preparation.",
    hard: "Challenging for Agniveer level. Multi-step or tricky.",
  },
  capf: {
    profile: "Graduate candidates for Central Armed Police Forces (BSF/CRPF/CISF etc.)",
    easy: "Basic GK, reasoning, or arithmetic at graduate level.",
    medium: "Moderate current affairs, reasoning, or aptitude.",
    hard: "Advanced GK depth or complex reasoning. Competitive level.",
  },
  defence: {
    profile: "Candidates for defence exams (10th/12th/Graduate depending on post)",
    easy: "Basic science, maths, or GK at the relevant level. Direct recall.",
    medium: "Needs preparation. Moderate reasoning or standard concepts.",
    hard: "Advanced for this defence exam level. Multi-step or requires strong preparation.",
  },
};

interface UploadedImageItem {
  id: string;
  filename: string;
  url: string;
  status: "uploading" | "success" | "failed";
}

export function AdminBulkImportStudio({ categories, sections }: Props) {
  const [activeTab, setActiveTab] = useState<"prompt" | "images" | "csv">("prompt");

  // ----------------------------------------------------
  // STEP 1: PROMPT GENERATOR STATE
  // ----------------------------------------------------
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [typeText, setTypeText] = useState(true);
  const [typeFigText, setTypeFigText] = useState(false);
  const [typeFigOpts, setTypeFigOpts] = useState(false);
  const [typeImgOpts, setTypeImgOpts] = useState(false);
  const [isPyq, setIsPyq] = useState(false);
  const [pyqSource, setPyqSource] = useState("");
  const [pyqYear, setPyqYear] = useState("");
  const [language, setLanguage] = useState<"english" | "hindi">("english");

  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [hasCopiedPrompt, setHasCopiedPrompt] = useState(false);

  // Auto-resolve Section ID and Category ID
  const activeCategoryObj = useMemo(
    () => categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory),
    [categories, selectedCategory]
  );

  const activeSectionObj = useMemo(
    () => sections.find((s) => s.slug === selectedSection || s.id === selectedSection || s.name === selectedSection),
    [sections, selectedSection]
  );

  const categoryUuid = activeCategoryObj?.id || "";
  const sectionUuid = activeSectionObj?.id || "";

  // ----------------------------------------------------
  // STEP 2: IMAGE UPLOADER STATE
  // ----------------------------------------------------
  const [uploadFolder, setUploadFolder] = useState<"questions" | "options">("questions");
  const [uploadQueue, setUploadQueue] = useState<UploadedImageItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // ----------------------------------------------------
  // STEP 3: CSV VALIDATOR & IMPORT STATE
  // ----------------------------------------------------
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [validationMessages, setValidationMessages] = useState<
    Array<{ type: "ok" | "error" | "warn"; text: string }>
  >([]);
  const [validationErrorsCount, setValidationErrorsCount] = useState<number | null>(null);
  const [validationWarningsCount, setValidationWarningsCount] = useState(0);

  // Import Progress
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, pct: 0 });
  const [importLogs, setImportLogs] = useState<Array<{ type: "ok" | "err"; message: string }>>([]);

  // Exam View Preview Modal
  const [isExamPreviewOpen, setIsExamPreviewOpen] = useState(false);
  const [examPreviewIndex, setExamPreviewIndex] = useState(0);

  // Keyboard navigation for exam preview
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isExamPreviewOpen) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setExamPreviewIndex((prev) => Math.min(parsedRows.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setExamPreviewIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Escape") {
        setIsExamPreviewOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExamPreviewOpen, parsedRows.length]);

  // ----------------------------------------------------
  // PROMPT GENERATION LOGIC (MATCHING LEGACY FILE EXACTLY)
  // ----------------------------------------------------
  function handleGeneratePrompt() {
    const exam = activeCategoryObj?.title || "the exam";
    const sectionName = activeSectionObj?.name || "General";
    const catId = categoryUuid || "REPLACE_WITH_CATEGORY_ID";
    const secId = sectionUuid || "REPLACE_WITH_SECTION_ID";

    const types: string[] = [];
    if (typeText) types.push("plain text question with text options (options_type = text)");
    if (typeFigText)
      types.push("text question + figure image (question_image = URL) + text options (options_type = text)");
    if (typeFigOpts)
      types.push("figure image question (question_image = URL) + text options (options_type = text)");
    if (typeImgOpts)
      types.push(
        "figure image question + image options — each option value is a URL (options_type = image)"
      );

    // Match exam benchmark
    const examLower = exam.toLowerCase();
    let benchmark = null;
    const sortedKeys = Object.keys(EXAM_BENCHMARKS).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (examLower.includes(key)) {
        benchmark = EXAM_BENCHMARKS[key];
        break;
      }
    }
    if (!benchmark) {
      benchmark = {
        profile: "Indian government exam aspirants",
        easy: "Direct recall or single-step problems. Most aspirants can solve quickly.",
        medium: "Requires preparation and 2-3 step reasoning or calculation.",
        hard: "Complex or multi-step. Only well-prepared aspirants solve comfortably.",
      };
    }

    const diffNote =
      difficulty === "mixed"
        ? `Decide difficulty per question based on the candidate level for ${exam}:
   - Candidate profile: ${benchmark.profile}
   - easy   = ${benchmark.easy}
   - medium = ${benchmark.medium}
   - hard   = ${benchmark.hard}
   Judge RELATIVE to this exam's aspirants — not as an absolute difficulty.`
        : `Set difficulty = "${difficulty}" for ALL rows.`;

    const pyqNote = isPyq
      ? `These ARE Previous Year Questions. Set pyq_source = "${pyqSource || "SOURCE_EXAM"}" and pyq_year = ${pyqYear || "YEAR"} for every row.`
      : "These are NOT previous year questions. Leave pyq_year and pyq_source blank.";

    const imgNote =
      typeFigText || typeFigOpts || typeImgOpts
        ? `\nIMAGE HANDLING — READ CAREFULLY:
- I will provide image URLs with filenames like q1_A.png, q1_B.png, q3_fig.png etc.
- Match each URL to the correct question number and option from the filename.
- For image options, the options cell must contain a JSON object where each value is a plain URL string.
- For mixed options (text + image): options = {"A":{"text":"...","image":"URL"},...} and options_type = mixed.
- Leave question_image blank if the question has no figure.

CRITICAL — CSV escaping for image options:
The options column must be wrapped in double quotes, and every double quote INSIDE must be escaped by doubling it.

CORRECT example for image options:
"{""A"":""https://example.com/q1_A.png"",""B"":""https://example.com/q1_B.png"",""C"":""https://example.com/q1_C.png"",""D"":""https://example.com/q1_D.png""}"

WRONG — do NOT do this (unescaped quotes will break the CSV):
{"A":"https://example.com/q1_A.png","B":"https://example.com/q1_B.png"}`
        : "";

    const promptStr = `You are a question bank formatter for an Indian government exam prep platform.

Convert the questions I give you into a CSV with EXACTLY these 15 columns in this order:
question_text, options, options_type, correct_answer, difficulty, topic, explanation, category_id, pattern_section_id, section_name, question_image, pyq_year, pyq_source, is_active, language

STRICT RULES:
1. question_text   — Full question text. Escape internal double quotes by doubling them ("").
                     For underlined text use [[u]]text[[/u]] markers — do NOT use HTML tags like <u>.
                     Use actual newlines (line breaks) inside question_text for multi-line questions — do not put everything on one line.
2. options         — JSON object wrapped in double quotes. Every " inside MUST be escaped as "".
                     Text example:  "{""A"":""Paris"",""B"":""London"",""C"":""Rome"",""D"":""Berlin""}"
                     Image example: "{""A"":""https://example.com/q1_A.png"",""B"":""https://example.com/q1_B.png"",""C"":""https://example.com/q1_C.png"",""D"":""https://example.com/q1_D.png""}"
                     NEVER output raw JSON without the outer quotes and inner "" escaping.
                     NEVER format URLs as markdown links like [text](url) — use the plain URL string only.
                     For underlined text inside any option value, use [[u]]text[[/u]] markers — do NOT use HTML tags like <u>.
3. options_type    — "text" | "image" | "mixed"
4. correct_answer  — Single uppercase letter: A, B, C, or D only. NOTHING else in this column.
5. difficulty      — ${diffNote}
6. topic           — Detect the topic/concept this question tests. Use short standard names.
                     Examples by section:
                     Reasoning      → "Blood Relations" | "Coding-Decoding" | "Syllogism" | "Venn Diagram" | "Number Series" | "Direction Sense" | "Analogy" | "Classification" | "Missing Number" | "Mirror Image" | "Paper Folding" | "Statement & Conclusion"
                     General Awareness → "History" | "Geography" | "Polity" | "Economy" | "Science & Technology" | "Current Affairs" | "Sports" | "Awards & Honours" | "Books & Authors" | "Defence"
                     Quantitative Aptitude → "Number System" | "Simplification" | "Percentage" | "Ratio & Proportion" | "Time & Work" | "Speed Distance Time" | "Profit & Loss" | "Average" | "Algebra" | "Geometry" | "Trigonometry" | "Data Interpretation"
                     Grammar/English → "Error Spotting" | "Fill in the Blanks" | "Synonyms" | "Antonyms" | "One Word Substitution" | "Idioms & Phrases" | "Comprehension" | "Sentence Rearrangement" | "Spelling" | "Active Passive"
                     If you are unsure, use the closest matching topic from the list above.
                     NEVER leave topic blank.
7. explanation     — Short explanation for why the answer is correct. Blank if unknown.
8. category_id     — Always use exactly: ${catId}
9. pattern_section_id — Always use exactly: ${secId}
10. section_name   — Always use exactly: ${sectionName}
11. question_image — Plain URL string if question has a figure, else leave blank "".
12. pyq_year       — ${isPyq ? (pyqYear || "year of the exam (number only)") : "leave blank"}.
13. pyq_source     — ${isPyq ? `"${pyqSource || "source exam name"}"` : "leave blank"}.
14. is_active      — Always: true
15. language       — Always: "${language}"
${imgNote}
EXAM CONTEXT:
- Exam: ${exam}
- Section: ${sectionName}
- ${pyqNote}

QUESTION TYPES IN THIS BATCH:
${types.length ? types.map((t, i) => `${i + 1}. ${t}`).join("\n") : "1. plain text question with text options"}

LANGUAGE:
${
  language === "hindi"
    ? `- ALL question_text and options must be in Hindi (Devanagari script: हिंदी).
- Do NOT transliterate — use proper Unicode Devanagari characters.
- Set language column = "hindi" for every single row.
- topic must still be English standard name (e.g. "Blood Relations").`
    : `- Questions are in English.
- Set language column = "english" for every row.`
}

OUTPUT RULES:
- Output ONLY the raw CSV. No explanation, no markdown, no code fences.
- First line must be the header row.
- Every question = one row.
- Wrap ALL text fields in double quotes.
- Do not skip any column — use empty "" for blank fields.
- Double-check: the correct_answer column must contain ONLY a single letter (A, B, C or D).
- Double-check: URLs must be plain strings like https://... — NEVER as markdown [text](url) format.
- Double-check: topic must NEVER be blank — every row must have a topic.

Paste your questions below this line:`;

    setGeneratedPrompt(promptStr);
  }

  function handleCopyPrompt() {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setHasCopiedPrompt(true);
    setTimeout(() => setHasCopiedPrompt(false), 2000);
  }

  // ----------------------------------------------------
  // IMAGE UPLOAD HANDLER
  // ----------------------------------------------------
  async function handleFilesUpload(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;

    setIsUploading(true);
    let done = 0;

    for (const file of fileArray) {
      const tempId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const tempItem: UploadedImageItem = {
        id: tempId,
        filename: file.name,
        url: "",
        status: "uploading",
      };
      setUploadQueue((prev) => [tempItem, ...prev]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", uploadFolder);

      try {
        const res = await uploadBulkImportImageAction(formData);
        if (res.success && res.url) {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === tempId ? { ...item, url: res.url!, status: "success" } : item
            )
          );
        } else {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === tempId ? { ...item, status: "failed" } : item
            )
          );
        }
      } catch {
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === tempId ? { ...item, status: "failed" } : item
          )
        );
      }

      done++;
      setUploadPct(Math.round((done / fileArray.length) * 100));
    }

    setIsUploading(false);
  }

  function handleCopyAllUrls() {
    const successfulUrls = uploadQueue
      .filter((u) => u.status === "success" && u.url)
      .map((u) => u.url);
    if (successfulUrls.length === 0) return;
    navigator.clipboard.writeText(successfulUrls.join("\n"));
    alert(`${successfulUrls.length} URLs copied to clipboard!`);
  }

  // ----------------------------------------------------
  // CSV VALIDATION LOGIC
  // ----------------------------------------------------
  function handleValidateCsv() {
    if (!csvText.trim()) {
      alert("Please paste a CSV first.");
      return;
    }

    const { data: rows, fields } = parseCSV(csvText);
    const msgs: Array<{ type: "ok" | "error" | "warn"; text: string }> = [];
    let errors = 0;
    let warnings = 0;

    // Check missing required columns
    const missing = REQUIRED_COLS.filter((c) => !fields.includes(c));
    if (missing.length) {
      msgs.push({ type: "error", text: `Missing required columns: ${missing.join(", ")}` });
      errors++;
    } else {
      msgs.push({ type: "ok", text: `All required columns found (${fields.length} total columns)` });
    }

    // Check unknown columns
    const extra = fields.filter((c) => !ALL_COLS.includes(c));
    if (extra.length) {
      msgs.push({ type: "warn", text: `Unknown columns (will be ignored): ${extra.join(", ")}` });
      warnings++;
    }

    // Row-level validations
    let rowErr = 0;
    rows.forEach((row, i) => {
      const n = i + 2;
      if (!row.question_text?.trim()) {
        msgs.push({ type: "error", text: `Row ${n}: question_text is empty` });
        rowErr++;
        errors++;
      }
      if (row.options) {
        try {
          const o = JSON.parse(row.options);
          if (!["A", "B", "C", "D"].every((k) => k in o)) {
            msgs.push({ type: "error", text: `Row ${n}: options missing A/B/C/D keys` });
            rowErr++;
            errors++;
          }
        } catch {
          msgs.push({
            type: "error",
            text: `Row ${n}: options is not valid JSON — check double-quote escaping`,
          });
          rowErr++;
          errors++;
        }
      }
      if (!["A", "B", "C", "D"].includes(row.correct_answer?.trim()?.toUpperCase())) {
        msgs.push({
          type: "error",
          text: `Row ${n}: correct_answer "${row.correct_answer}" must be A, B, C, or D`,
        });
        rowErr++;
        errors++;
      }
      if (
        row.difficulty &&
        !["easy", "medium", "hard"].includes(row.difficulty.trim().toLowerCase())
      ) {
        msgs.push({
          type: "error",
          text: `Row ${n}: difficulty "${row.difficulty}" must be easy, medium, or hard`,
        });
        rowErr++;
        errors++;
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (row.category_id && !uuidRegex.test(row.category_id.trim())) {
        msgs.push({ type: "warn", text: `Row ${n}: category_id doesn't look like a standard UUID` });
        warnings++;
      }
      if (row.pattern_section_id && !uuidRegex.test(row.pattern_section_id.trim())) {
        msgs.push({
          type: "warn",
          text: `Row ${n}: pattern_section_id doesn't look like a standard UUID`,
        });
        warnings++;
      }
    });

    if (rowErr === 0 && errors === 0) {
      msgs.push({ type: "ok", text: `All ${rows.length} rows passed structural validation` });
    }

    setParsedRows(rows);
    setValidationMessages(msgs);
    setValidationErrorsCount(errors);
    setValidationWarningsCount(warnings);
  }

  function handleLoadSample() {
    const catId = categoryUuid || "00000000-0000-0000-0000-000000000001";
    const secId = sectionUuid || "00000000-0000-0000-0000-000000000002";
    setCsvText(
      `question_text,options,options_type,correct_answer,difficulty,topic,explanation,category_id,pattern_section_id,section_name,question_image,pyq_year,pyq_source,is_active,language
"What is the capital of India?","{""A"":""Mumbai"",""B"":""New Delhi"",""C"":""Chennai"",""D"":""Kolkata""}",text,B,easy,"Indian Geography","New Delhi became the capital of India in 1911 during British rule.","${catId}","${secId}","General Awareness","",,"","",true,english
"Who composed the Indian national song 'Vande Mataram'?","{""A"":""Bankim Chandra Chattopadhyay"",""B"":""Rabindranath Tagore"",""C"":""Sarojini Naidu"",""D"":""Sri Aurobindo""}",text,A,easy,"Indian History","Vande Mataram was written by Bankim Chandra Chattopadhyay in his 1882 novel Anandamath.","${catId}","${secId}","General Awareness","",2022,"SSC CGL",true,english`
    );
  }

  function handleResetCsv() {
    setCsvText("");
    setParsedRows([]);
    setValidationMessages([]);
    setValidationErrorsCount(null);
    setValidationWarningsCount(0);
    setImportLogs([]);
  }

  // ----------------------------------------------------
  // DATABASE IMPORT EXECUTION
  // ----------------------------------------------------
  async function handleImportToDatabase() {
    if (parsedRows.length === 0 || validationErrorsCount !== 0) return;

    setIsImporting(true);
    setImportProgress({ done: 0, total: parsedRows.length, pct: 0 });
    setImportLogs([]);

    const BATCH_SIZE = 20;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
      const slice = parsedRows.slice(i, i + BATCH_SIZE);
      const batchRecords: BulkImportQuestionRecord[] = slice.map((r) => ({
        question_text: r.question_text,
        options: r.options,
        options_type: r.options_type,
        correct_answer: r.correct_answer,
        difficulty: r.difficulty,
        topic: r.topic,
        explanation: r.explanation,
        category_id: r.category_id,
        pattern_section_id: r.pattern_section_id,
        section_name: r.section_name,
        question_image: r.question_image,
        pyq_year: r.pyq_year,
        pyq_source: r.pyq_source,
        is_active: r.is_active,
        language: r.language,
      }));

      const from = i + 1;
      const to = Math.min(i + BATCH_SIZE, parsedRows.length);

      try {
        const res = await importBulkQuestionsAction(batchRecords);
        if (res.success || res.inserted > 0) {
          totalSuccess += res.inserted;
          setImportLogs((prev) => [
            ...prev,
            { type: "ok", message: `Rows ${from}–${to}: ${res.inserted} questions imported ✓` },
          ]);
        } else {
          totalFailed += res.failed;
          setImportLogs((prev) => [
            ...prev,
            { type: "err", message: `Rows ${from}–${to}: Failed — ${res.errors.join("; ")}` },
          ]);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        totalFailed += slice.length;
        setImportLogs((prev) => [
          ...prev,
          { type: "err", message: `Rows ${from}–${to}: Exception — ${err?.message || "Unknown error"}` },
        ]);
      }

      const doneCount = Math.min(i + BATCH_SIZE, parsedRows.length);
      setImportProgress({
        done: doneCount,
        total: parsedRows.length,
        pct: Math.round((doneCount / parsedRows.length) * 100),
      });
    }

    setIsImporting(false);
    setImportLogs((prev) => [
      ...prev,
      {
        type: totalFailed === 0 ? "ok" : "err",
        message: `Import Finished: ${totalSuccess} inserted successfully, ${totalFailed} failed.`,
      },
    ]);
  }

  // ----------------------------------------------------
  // EXAM VIEW PREVIEW HELPER
  // ----------------------------------------------------
  const currentPreviewQuestion = parsedRows[examPreviewIndex] || null;
  const previewOptions = useMemo(() => {
    if (!currentPreviewQuestion?.options) return { A: "", B: "", C: "", D: "" };
    try {
      return JSON.parse(currentPreviewQuestion.options);
    } catch {
      return { A: "", B: "", C: "", D: "" };
    }
  }, [currentPreviewQuestion]);

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Mock Test Management", href: "/admin/mock-tests-management" },
          { label: "Bulk Question Importer", active: true },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-indigo-600" /> Bulk Question Import Toolkit
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            3-step production content pipeline: Generate AI prompt → Upload figures &amp; option images → Validate &amp; Import CSV.
          </p>
        </div>
      </div>

      {/* 3 Step Tabs Navigation */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab("prompt")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition select-none ${
            activeTab === "prompt"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Wand2 className="w-4 h-4" /> Step 1 · Prompt Generator
        </button>

        <button
          onClick={() => setActiveTab("images")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition select-none ${
            activeTab === "images"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Step 2 · Image Uploader
        </button>

        <button
          onClick={() => setActiveTab("csv")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition select-none ${
            activeTab === "csv"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Step 3 · CSV Validator &amp; Import
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PROMPT GENERATOR                                                   */}
      {/* ========================================================================= */}
      {activeTab === "prompt" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Config Left Column */}
          <Card className="lg:col-span-6 p-6 bg-white border-slate-200 space-y-5 shadow-xs">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-mono">
                1
              </span>{" "}
              Configure Your Question Set
            </h2>

            {/* Exam Name / Category Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Exam Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">— Select Category —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.title} ({cat.category || "National"})
                  </option>
                ))}
              </select>
            </div>

            {/* Section / Subject Dropdown */}
            {selectedCategory && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Section / Subject</label>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="">— Select Section —</option>
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.slug || sec.name}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Auto-filled UUIDs Card */}
            {categoryUuid && sectionUuid && (
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <p className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> UUIDs auto-resolved from selection
                </p>
                <div className="grid grid-cols-1 gap-2 font-mono text-[10px]">
                  <div>
                    <span className="text-emerald-700 font-bold block mb-0.5">category_id</span>
                    <input
                      readOnly
                      value={categoryUuid}
                      className="w-full p-1.5 rounded-lg border border-emerald-200 bg-white text-slate-600 select-all"
                    />
                  </div>
                  <div>
                    <span className="text-emerald-700 font-bold block mb-0.5">pattern_section_id</span>
                    <input
                      readOnly
                      value={sectionUuid}
                      className="w-full p-1.5 rounded-lg border border-emerald-200 bg-white text-slate-600 select-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Difficulty Pills */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Difficulty Calibration</label>
              <div className="flex flex-wrap gap-2">
                {(["easy", "medium", "hard", "mixed"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition capitalize ${
                      difficulty === d
                        ? d === "easy"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : d === "medium"
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : d === "hard"
                          ? "border-rose-500 bg-rose-50 text-rose-700"
                          : "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {d === "mixed" ? "Mixed (AI decides)" : d}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Types Checklist */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Question Types in this batch</label>
              <div className="space-y-1.5 text-xs text-slate-700 font-medium">
                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeText}
                    onChange={(e) => setTypeText(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Text question + text options</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFigText}
                    onChange={(e) => setTypeFigText(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Text question + figure image + text options</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeFigOpts}
                    onChange={(e) => setTypeFigOpts(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Figure image question + text options</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeImgOpts}
                    onChange={(e) => setTypeImgOpts(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Figure image question + image options</span>
                </label>
              </div>
            </div>

            {/* PYQ Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Is this a PYQ batch?</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPyq(true)}
                  className={`px-4 py-1.5 rounded-xl border text-xs font-bold transition ${
                    isPyq
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setIsPyq(false)}
                  className={`px-4 py-1.5 rounded-xl border text-xs font-bold transition ${
                    !isPyq
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  No
                </button>
              </div>

              {isPyq && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Source Exam</label>
                    <input
                      value={pyqSource}
                      onChange={(e) => setPyqSource(e.target.value)}
                      placeholder="e.g. SSC CGL Tier-1"
                      className="w-full p-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Year</label>
                    <input
                      value={pyqYear}
                      onChange={(e) => setPyqYear(e.target.value)}
                      placeholder="e.g. 2023"
                      className="w-full p-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Language Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Question Language</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("english")}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition ${
                    language === "english"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  🇬🇧 English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("hindi")}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition ${
                    language === "hindi"
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  🇮🇳 Hindi (हिंदी)
                </button>
              </div>

              {language === "hindi" && (
                <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-700 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Hindi Batch Notes:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>AI will output statements &amp; options in Devanagari script.</li>
                    <li>
                      Prompt forces <code className="bg-orange-100 px-1 rounded">language = hindi</code>.
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Generate Prompt Button */}
            <Button
              onClick={handleGeneratePrompt}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow-xs"
            >
              <Wand2 className="w-4 h-4 mr-2" /> Generate Prompt
            </Button>
          </Card>

          {/* Generated Prompt Output Right Column */}
          <Card className="lg:col-span-6 p-6 bg-white border-slate-200 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-mono">
                    2
                  </span>{" "}
                  Copy Prompt → Give to AI
                </h2>
                {generatedPrompt && (
                  <Button
                    onClick={handleCopyPrompt}
                    size="sm"
                    variant="outline"
                    className={`text-xs font-bold ${
                      hasCopiedPrompt ? "bg-emerald-600 text-white border-emerald-600" : ""
                    }`}
                  >
                    {hasCopiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy Prompt
                      </>
                    )}
                  </Button>
                )}
              </div>

              {!generatedPrompt ? (
                <div className="py-24 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-2xl">
                  <Wand2 className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-medium">Select exam parameters and click Generate Prompt</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    readOnly
                    value={generatedPrompt}
                    rows={15}
                    className="w-full p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] leading-relaxed border border-slate-800 focus:outline-hidden resize-none"
                  />

                  <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-indigo-600" /> How to use with ChatGPT / Claude:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-indigo-800">
                      <li>Copy the generated prompt above.</li>
                      <li>Paste it into ChatGPT or Claude, then paste your raw questions below it.</li>
                      <li>AI outputs a valid RFC CSV — copy the CSV text.</li>
                      <li>
                        Switch to <strong>Step 3 · CSV Validator &amp; Import</strong> to preview and commit.
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: IMAGE UPLOADER                                                     */}
      {/* ========================================================================= */}
      {activeTab === "images" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload Drop Zone Left Column */}
          <Card className="lg:col-span-6 p-6 bg-white border-slate-200 space-y-5 shadow-xs">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-mono">
                2
              </span>{" "}
              Upload Question / Option Images
            </h2>

            {/* Folder Switch */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Storage Destination</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUploadFolder("questions")}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition ${
                    uploadFolder === "questions"
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Question Figures (/questions/)
                </button>
                <button
                  type="button"
                  onClick={() => setUploadFolder("options")}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition ${
                    uploadFolder === "options"
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Option Images (/options/)
                </button>
              </div>
            </div>

            {/* Naming Convention Box */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
              <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-600" /> File Naming Convention (Required for AI Mapping)
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Rename your image files before uploading so that AI can automatically map each URL to the correct row
                and option:
              </p>

              <div className="space-y-2 text-[11px]">
                <div className="p-2 bg-white rounded-lg border border-blue-100 space-y-1">
                  <span className="font-bold text-slate-700 block">Question Figures:</span>
                  <div className="flex gap-2">
                    <code className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q1_fig.png
                    </code>
                    <code className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q3_fig.png
                    </code>
                  </div>
                </div>

                <div className="p-2 bg-white rounded-lg border border-blue-100 space-y-1">
                  <span className="font-bold text-slate-700 block">Option Images (A, B, C, D):</span>
                  <div className="flex gap-2">
                    <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q2_A.png
                    </code>
                    <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q2_B.png
                    </code>
                    <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q2_C.png
                    </code>
                    <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                      q2_D.png
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files) handleFilesUpload(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById("bulkImgInput")?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                isDragOver
                  ? "border-indigo-600 bg-indigo-50/50"
                  : "border-slate-300 hover:border-indigo-400 bg-slate-50/50"
              }`}
            >
              <UploadCloud className="w-10 h-10 mx-auto text-indigo-500 mb-2" />
              <p className="text-xs font-bold text-slate-800">Drop images here or click to select</p>
              <p className="text-[11px] text-slate-400 mt-1">Supports PNG, JPG, WebP · Select multiple files</p>
              <input
                id="bulkImgInput"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Progress Bar */}
            {isUploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Uploading files to Supabase Storage...</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Uploaded URLs Table Right Column */}
          <Card className="lg:col-span-6 p-6 bg-white border-slate-200 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">Uploaded URLs ({uploadQueue.length})</h2>
              {uploadQueue.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyAllUrls}
                    size="sm"
                    variant="outline"
                    className="text-xs font-bold"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy All URLs
                  </Button>
                  <Button
                    onClick={() => setUploadQueue([])}
                    size="sm"
                    variant="ghost"
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            {uploadQueue.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-xl">
                <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-medium">Uploaded image URLs will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate max-w-[280px]">
                        {item.status === "uploading" ? (
                          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                        ) : item.status === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-800 truncate">{item.filename}</span>
                      </div>
                      {item.url && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(item.url);
                            alert("URL copied!");
                          }}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 bg-indigo-50 rounded-md"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">All URLs Formatted for AI Prompt</label>
                  <textarea
                    readOnly
                    rows={6}
                    value={uploadQueue
                      .filter((u) => u.status === "success" && u.url)
                      .map((u, i) => `${i + 1}. ${u.filename}\n   ${u.url}`)
                      .join("\n\n")}
                    className="w-full p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[10px] border border-slate-800 resize-none"
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV VALIDATOR & IMPORT                                             */}
      {/* ========================================================================= */}
      {activeTab === "csv" && (
        <div className="space-y-6">
          {/* CSV Input Card */}
          <Card className="p-6 bg-white border-slate-200 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-mono">
                  3
                </span>{" "}
                Paste CSV from AI
              </h2>
              <button
                onClick={handleLoadSample}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
              >
                Load Sample CSV
              </button>
            </div>

            {/* Expected Columns Banner */}
            <div className="p-3 bg-slate-950 rounded-xl text-[11px] font-mono text-emerald-400 leading-relaxed">
              <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Expected 15 Columns:</span>
              question_text, options, options_type, correct_answer, difficulty, topic, explanation, category_id,
              pattern_section_id, section_name, question_image, pyq_year, pyq_source, is_active, language
            </div>

            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder='question_text,options,options_type,correct_answer,difficulty,...&#10;"What is 2+2?","{""A"":""3"",""B"":""4"",""C"":""5"",""D"":""6""}",text,B,easy,...'
              className="w-full p-3.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-800 bg-slate-50/40 focus:outline-hidden focus:border-indigo-500 focus:bg-white"
            />

            <div className="flex items-center gap-3">
              <Button
                onClick={handleValidateCsv}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs"
              >
                <Check className="w-4 h-4 mr-1.5" /> Validate CSV
              </Button>
              <Button
                onClick={handleResetCsv}
                variant="outline"
                className="text-xs font-bold border-slate-200 text-slate-600"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            </div>
          </Card>

          {/* Validation Results Card */}
          {validationErrorsCount !== null && (
            <Card className="p-6 bg-white border-slate-200 space-y-6 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-sm font-black text-slate-900">Validation Results</h3>
                <div className="flex gap-2">
                  <Badge variant="indigo" className="text-xs font-bold">
                    {parsedRows.length} Rows
                  </Badge>
                  <Badge
                    variant={validationErrorsCount === 0 ? "success" : "error"}
                    className="text-xs font-bold"
                  >
                    {validationErrorsCount} Errors
                  </Badge>
                  {validationWarningsCount > 0 && (
                    <Badge variant="warning" className="text-xs font-bold">
                      {validationWarningsCount} Warnings
                    </Badge>
                  )}
                </div>
              </div>

              {/* Validation Messages List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {validationMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                      msg.type === "ok"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                        : msg.type === "error"
                        ? "bg-rose-50 text-rose-800 border border-rose-100"
                        : "bg-amber-50 text-amber-800 border border-amber-100"
                    }`}
                  >
                    {msg.type === "ok" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : msg.type === "error" ? (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>{msg.text}</span>
                  </div>
                ))}
              </div>

              {/* Preview First 5 Rows Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Preview — First 5 Rows
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-[11px] divide-y divide-slate-200">
                      <thead className="bg-slate-50 font-bold text-slate-600">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Statement</th>
                          <th className="p-2.5">Options</th>
                          <th className="p-2.5">Ans</th>
                          <th className="p-2.5">Diff</th>
                          <th className="p-2.5">Topic</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-medium text-slate-800 max-w-xs truncate">
                              {row.question_text}
                            </td>
                            <td className="p-2.5 font-mono text-[10px] text-slate-500 max-w-xs truncate">
                              {row.options}
                            </td>
                            <td className="p-2.5 font-bold text-emerald-700">{row.correct_answer}</td>
                            <td className="p-2.5 capitalize">{row.difficulty}</td>
                            <td className="p-2.5">{row.topic}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ready to Import Actions */}
              {validationErrorsCount === 0 && parsedRows.length > 0 && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-black text-emerald-900">Ready to Import!</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {parsedRows.length} questions validated and ready for relational ingestion.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => {
                        setExamPreviewIndex(0);
                        setIsExamPreviewOpen(true);
                      }}
                      variant="outline"
                      className="text-xs font-bold border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50"
                    >
                      <Eye className="w-4 h-4 mr-1.5" /> Preview in Exam View
                    </Button>

                    <Button
                      onClick={handleImportToDatabase}
                      disabled={isImporting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Ingesting...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4 mr-1.5" /> Import to Database
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Import Progress & Logs */}
          {isImporting && (
            <Card className="p-6 bg-white border-slate-200 space-y-4 shadow-xs">
              <div className="flex justify-between text-xs font-bold text-slate-800">
                <span>Ingesting into Question Architecture...</span>
                <span>
                  {importProgress.done} / {importProgress.total} ({importProgress.pct}%)
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${importProgress.pct}%` }}
                />
              </div>
            </Card>
          )}

          {importLogs.length > 0 && (
            <Card className="p-6 bg-white border-slate-200 space-y-3 shadow-xs">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Import Log</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs font-mono">
                {importLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg ${
                      log.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                    }`}
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXAM VIEW PREVIEW MODAL (FULL FIDELITY EXAM ENGINE SIMULATOR)              */}
      {/* ========================================================================= */}
      {isExamPreviewOpen && currentPreviewQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 block font-mono">
                  Exam View Simulator
                </span>
                <h3 className="text-base font-black">
                  Q{examPreviewIndex + 1} —{" "}
                  {currentPreviewQuestion.section_name || currentPreviewQuestion.topic || "General"}
                </h3>
              </div>
              <button
                onClick={() => setIsExamPreviewOpen(false)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white font-bold transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                {/* Meta Badges */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <Badge variant="indigo" className="capitalize font-bold">
                    {currentPreviewQuestion.difficulty || "medium"}
                  </Badge>
                  <Badge variant="outline" className="font-bold">
                    {currentPreviewQuestion.language === "hindi" ? "🇮🇳 Hindi" : "🇬🇧 English"}
                  </Badge>
                  {currentPreviewQuestion.topic && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {currentPreviewQuestion.topic}
                    </Badge>
                  )}
                  {currentPreviewQuestion.pyq_year && (
                    <Badge variant="warning" className="font-bold">
                      PYQ {currentPreviewQuestion.pyq_year}{" "}
                      {currentPreviewQuestion.pyq_source ? `· ${currentPreviewQuestion.pyq_source}` : ""}
                    </Badge>
                  )}
                </div>

                {/* Question Figure Image */}
                {currentPreviewQuestion.question_image && (
                  <div className="rounded-xl border border-slate-100 overflow-hidden max-h-56 flex items-center justify-center bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentPreviewQuestion.question_image}
                      alt="Question Figure"
                      className="max-h-56 object-contain"
                    />
                  </div>
                )}

                {/* Question Text */}
                <div className="text-base font-bold text-slate-900 leading-relaxed">
                  {currentPreviewQuestion.question_text}
                </div>

                {/* Option Items */}
                <div className="space-y-2.5 pt-2">
                  {(["A", "B", "C", "D"] as const).map((key) => {
                    const isCorrect = key === (currentPreviewQuestion.correct_answer || "").trim().toUpperCase();
                    const val = previewOptions[key];
                    const isImgOpt =
                      (currentPreviewQuestion.options_type || "").toLowerCase() === "image" &&
                      typeof val === "string" &&
                      val.startsWith("http");

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-xl border-2 flex items-center justify-between text-xs font-semibold transition ${
                          isCorrect
                            ? "border-emerald-600 bg-emerald-50/60 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                              isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {key}
                          </span>
                          {isImgOpt ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={val} alt={`Option ${key}`} className="h-10 object-contain rounded-md" />
                          ) : (
                            <span>
                              {typeof val === "object" && val !== null
                                ? (val as { text?: string }).text || ""
                                : String(val || "")}
                            </span>
                          )}
                        </div>

                        {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation Card */}
                {currentPreviewQuestion.explanation && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600" /> Explanation:
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      {currentPreviewQuestion.explanation}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Navigation */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExamPreviewIndex((prev) => Math.max(0, prev - 1))}
                disabled={examPreviewIndex === 0}
                className="text-xs font-bold"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Previous
              </Button>

              <span className="text-xs font-mono font-bold text-slate-600">
                {examPreviewIndex + 1} / {parsedRows.length}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setExamPreviewIndex((prev) => Math.min(parsedRows.length - 1, prev + 1))}
                disabled={examPreviewIndex === parsedRows.length - 1}
                className="text-xs font-bold"
              >
                Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
