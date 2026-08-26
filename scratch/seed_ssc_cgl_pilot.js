global.WebSocket = class DummyWebSocket {};
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return await fn();
}

async function seedPilot() {
  console.log("=== STARTING SSC CGL PRODUCTION PILOT SEEDING ===");

  // 1. Conducting Org
  const { data: orgData } = await safeDb(() =>
    supabase.from("conducting_orgs").upsert({ name: "Staff Selection Commission", slug: "ssc" }, { onConflict: "slug" }).select("id").single()
  );
  const orgId = orgData?.id || null;

  // 2. Exam: SSC CGL
  const { data: examData, error: examErr } = await safeDb(() =>
    supabase.from("exams").upsert(
      {
        title: "SSC CGL (Combined Graduate Level)",
        slug: "ssc-cgl",
        category: "Staff Selection Commission (SSC)",
        description: "Premier recruitment examination for Group B and Group C officers across Ministries and Departments of Government of India.",
        org_id: orgId,
        is_active: true,
      },
      { onConflict: "slug" }
    ).select("id").single()
  );

  if (examErr) console.error("Exam Error:", examErr.message);
  const examId = examData?.id;
  console.log("1. Exam ID:", examId);

  // 3. Subjects
  const subjectsData = [
    { name: "General Intelligence & Reasoning", slug: "ssc-cgl-reasoning" },
    { name: "Quantitative Aptitude", slug: "ssc-cgl-quant" },
    { name: "General Awareness", slug: "ssc-cgl-ga" },
    { name: "English Comprehension", slug: "ssc-cgl-english" },
  ];

  const subjectMap = {};
  for (const s of subjectsData) {
    const { data: sRes, error: sErr } = await safeDb(() =>
      supabase.from("subjects").upsert({ name: s.name, slug: s.slug }, { onConflict: "slug" }).select("id").single()
    );
    if (sErr) console.error(`Subject ${s.slug} error:`, sErr.message);
    else subjectMap[s.slug] = sRes.id;
  }
  console.log("2. Subjects Map:", subjectMap);

  // 4. Topics
  const topicsData = [
    { subject_slug: "ssc-cgl-reasoning", name: "Analogy & Classification", slug: "ssc-analogy" },
    { subject_slug: "ssc-cgl-quant", name: "Number System & Simplification", slug: "ssc-number-system" },
    { subject_slug: "ssc-cgl-ga", name: "Indian Constitution & Polity", slug: "ssc-polity" },
    { subject_slug: "ssc-cgl-english", name: "Grammar & Error Spotting", slug: "ssc-grammar" },
  ];

  const topicMap = {};
  for (const t of topicsData) {
    const sId = subjectMap[t.subject_slug];
    const { data: tRes, error: tErr } = await safeDb(() =>
      supabase.from("topics").upsert({ subject_id: sId, name: t.name, slug: t.slug }, { onConflict: "slug" }).select("id").single()
    );
    if (tErr) console.error(`Topic ${t.slug} error:`, tErr.message);
    else topicMap[t.slug] = tRes.id;
  }
  console.log("3. Topics Map:", topicMap);

  // 5. Objective Questions & Versions (20 High Quality Questions)
  const rawQuestions = [
    // Reasoning - Analogy (5 Qs)
    {
      topic_slug: "ssc-analogy",
      text: "Select the related word from the given alternatives: Thermometer : Temperature :: Barometer : ?",
      marks: 2,
      explanation: "A Thermometer is an instrument used to measure Temperature. Similarly, a Barometer is used to measure Atmospheric Pressure.",
      options: [
        { text: "Humidity", correct: false },
        { text: "Atmospheric Pressure", correct: true },
        { text: "Thickness", correct: false },
        { text: "Wind Velocity", correct: false },
      ],
    },
    {
      topic_slug: "ssc-analogy",
      text: "Select the related number from the given options: 7 : 56 :: 9 : ?",
      marks: 2,
      explanation: "Pattern: n : n * (n + 1). For 7, 7 * 8 = 56. For 9, 9 * 10 = 90.",
      options: [
        { text: "81", correct: false },
        { text: "90", correct: true },
        { text: "72", correct: false },
        { text: "99", correct: false },
      ],
    },
    {
      topic_slug: "ssc-analogy",
      text: "In a certain code language, 'COMPUTER' is written as 'RFUVQNPC'. How is 'MEDICINE' written in that code?",
      marks: 2,
      explanation: "Reverse the letters of the word and move each letter +1 position.",
      options: [
        { text: "EOJDJEFM", correct: true },
        { text: "EOJDEJFM", correct: false },
        { text: "MFEJDJOE", correct: false },
        { text: "EOJDJFEM", correct: false },
      ],
    },
    {
      topic_slug: "ssc-analogy",
      text: "Doctor is related to Hospital in the same way as Teacher is related to:",
      marks: 2,
      explanation: "A Doctor works in a Hospital; a Teacher works in a School.",
      options: [
        { text: "Office", correct: false },
        { text: "School", correct: true },
        { text: "Student", correct: false },
        { text: "Class", correct: false },
      ],
    },
    {
      topic_slug: "ssc-analogy",
      text: "Select the odd letter pair out of the four alternatives: ABCD : WXYZ :: EFGH : ?",
      marks: 2,
      explanation: "Opposite pairs in alphabet: A-Z, B-Y, C-X, D-W. Similarly E-V, F-U, G-T, H-S -> VUTS.",
      options: [
        { text: "STUV", correct: false },
        { text: "VUTS", correct: true },
        { text: "TSRV", correct: false },
        { text: "UTSR", correct: false },
      ],
    },

    // Quant - Number System (5 Qs)
    {
      topic_slug: "ssc-number-system",
      text: "What is the unit digit of (7^95 - 3^58)?",
      marks: 2,
      explanation: "Cyclicity of 7 is 4. 95 % 4 = 3 -> 7^3 ends in 3. Cyclicity of 3 is 4. 58 % 4 = 2 -> 3^2 ends in 9. 13 - 9 = 4.",
      options: [
        { text: "0", correct: false },
        { text: "4", correct: true },
        { text: "6", correct: false },
        { text: "7", correct: false },
      ],
    },
    {
      topic_slug: "ssc-number-system",
      text: "Find the smallest 4-digit number which is exactly divisible by 12, 18, 21, and 28.",
      marks: 2,
      explanation: "LCM(12, 18, 21, 28) = 252. Smallest 4-digit multiple of 252 is 252 * 4 = 1008.",
      options: [
        { text: "1008", correct: true },
        { text: "1024", correct: false },
        { text: "1080", correct: false },
        { text: "1000", correct: false },
      ],
    },
    {
      topic_slug: "ssc-number-system",
      text: "If a number 653xy is divisible by 80, then what is the value of (x + y)?",
      marks: 2,
      explanation: "Since divisible by 80 (8 * 10), y = 0. Number 653x0 must be divisible by 8 -> 3x0 divisible by 8 -> x = 6. x + y = 6.",
      options: [
        { text: "2", correct: false },
        { text: "6", correct: true },
        { text: "4", correct: false },
        { text: "8", correct: false },
      ],
    },
    {
      topic_slug: "ssc-number-system",
      text: "The sum of the digits of a 2-digit number is 10. If 18 is subtracted from the number, the digits reverse. What is the number?",
      marks: 2,
      explanation: "Let number be 10a + b. 10a + b - 18 = 10b + a -> 9(a - b) = 18 -> a - b = 2. Since a + b = 10 -> a = 6, b = 4. Number is 64.",
      options: [
        { text: "64", correct: true },
        { text: "46", correct: false },
        { text: "73", correct: false },
        { text: "82", correct: false },
      ],
    },
    {
      topic_slug: "ssc-number-system",
      text: "What is the remainder when (67^67 + 67) is divided by 68?",
      marks: 2,
      explanation: "67 = 68 - 1. (-1)^67 + 67 = -1 + 67 = 66.",
      options: [
        { text: "1", correct: false },
        { text: "66", correct: true },
        { text: "67", correct: false },
        { text: "0", correct: false },
      ],
    },

    // Polity (5 Qs)
    {
      topic_slug: "ssc-polity",
      text: "Which Article of the Indian Constitution guarantees the Right to Equality before Law?",
      marks: 2,
      explanation: "Article 14 guarantees equality before law and equal protection of laws.",
      options: [
        { text: "Article 14", correct: true },
        { text: "Article 19", correct: false },
        { text: "Article 21", correct: false },
        { text: "Article 32", correct: false },
      ],
    },
    {
      topic_slug: "ssc-polity",
      text: "Who among the following acts as the ex-officio Chairman of the Rajya Sabha?",
      marks: 2,
      explanation: "Under Article 64, the Vice-President of India is the ex-officio Chairman of the Council of States (Rajya Sabha).",
      options: [
        { text: "Prime Minister of India", correct: false },
        { text: "Vice-President of India", correct: true },
        { text: "Speaker of Lok Sabha", correct: false },
        { text: "President of India", correct: false },
      ],
    },
    {
      topic_slug: "ssc-polity",
      text: "By which Constitutional Amendment Act was the voting age reduced from 21 years to 18 years?",
      marks: 2,
      explanation: "The 61st Constitutional Amendment Act, 1988 reduced the voting age for Lok Sabha and Assembly elections from 21 to 18 years.",
      options: [
        { text: "42nd Amendment", correct: false },
        { text: "44th Amendment", correct: false },
        { text: "61st Amendment", correct: true },
        { text: "73rd Amendment", correct: false },
      ],
    },
    {
      topic_slug: "ssc-polity",
      text: "Which Fundamental Right was called the 'Heart and Soul of the Constitution' by Dr. B.R. Ambedkar?",
      marks: 2,
      explanation: "Dr. B.R. Ambedkar described Article 32 (Right to Constitutional Remedies) as the Heart and Soul of the Constitution.",
      options: [
        { text: "Right to Equality", correct: false },
        { text: "Right to Freedom of Speech", correct: false },
        { text: "Right to Constitutional Remedies", correct: true },
        { text: "Right to Life", correct: false },
      ],
    },
    {
      topic_slug: "ssc-polity",
      text: "The Panchayati Raj System in India was constitutionalized by which Amendment Act?",
      marks: 2,
      explanation: "The 73rd Constitutional Amendment Act, 1992 added Part IX and the 11th Schedule establishing Panchayati Raj Institutions.",
      options: [
        { text: "73rd Amendment Act", correct: true },
        { text: "74th Amendment Act", correct: false },
        { text: "86th Amendment Act", correct: false },
        { text: "42nd Amendment Act", correct: false },
      ],
    },

    // English (5 Qs)
    {
      topic_slug: "ssc-grammar",
      text: "Identify the segment containing a grammatical error: 'Neither the manager nor the employees was present at the conference.'",
      marks: 2,
      explanation: "When two subjects are joined by 'neither... nor', the verb agrees with the subject nearest to it. 'employees' is plural, so 'were present' is required.",
      options: [
        { text: "Neither the manager", correct: false },
        { text: "nor the employees", correct: false },
        { text: "was present at", correct: true },
        { text: "the conference", correct: false },
      ],
    },
    {
      topic_slug: "ssc-grammar",
      text: "Select the antonym of the given word: OPAQUE",
      marks: 2,
      explanation: "Opaque means not transparent. Its antonym is Transparent or Clear.",
      options: [
        { text: "Transparent", correct: true },
        { text: "Turbid", correct: false },
        { text: "Hazy", correct: false },
        { text: "Obscure", correct: false },
      ],
    },
    {
      topic_slug: "ssc-grammar",
      text: "Select the correctly spelt word:",
      marks: 2,
      explanation: "The correct spelling is 'ACCOMMODATION' with double 'c' and double 'm'.",
      options: [
        { text: "Acommodation", correct: false },
        { text: "Accommodation", correct: true },
        { text: "Accomodation", correct: false },
        { text: "Acommodasion", correct: false },
      ],
    },
    {
      topic_slug: "ssc-grammar",
      text: "Select the option that gives the correct meaning of the idiom: 'To spill the beans'",
      marks: 2,
      explanation: "'Spill the beans' means to reveal secret information prematurely or unintentionally.",
      options: [
        { text: "To waste food", correct: false },
        { text: "To reveal a secret", correct: true },
        { text: "To cause an accident", correct: false },
        { text: "To speak rudely", correct: false },
      ],
    },
    {
      topic_slug: "ssc-grammar",
      text: "Select the sentence with NO spelling errors:",
      marks: 2,
      explanation: "'The entrepreneur achieved extraordinary success.' has all correct spellings.",
      options: [
        { text: "The entreprenuer achieved extraordinary success.", correct: false },
        { text: "The entrepreneur achieved extraordinary success.", correct: true },
        { text: "The entrepreneur acheived extraordinary success.", correct: false },
        { text: "The entreprenuer acheived extaordinary success.", correct: false },
      ],
    },
  ];

  let insertedCount = 0;
  for (const q of rawQuestions) {
    const topicId = topicMap[q.topic_slug];
    if (!topicId) continue;

    const { data: qRes, error: qErr } = await safeDb(() =>
      supabase.from("questions").insert({ canonical_topic_id: topicId }).select("id").single()
    );

    if (qErr) {
      console.error(`Question insert error:`, qErr.message);
    } else if (qRes) {
      const { data: vRes, error: vErr } = await safeDb(() =>
        supabase
          .from("question_versions")
          .insert({
            question_id: qRes.id,
            version_number: 1,
            question_text: q.text,
          })
          .select("id")
          .single()
      );

      if (vErr) {
        console.error(`Version insert error:`, vErr.message);
      } else if (vRes) {
        insertedCount++;
        const keys = ["A", "B", "C", "D"];
        for (let i = 0; i < q.options.length; i++) {
          const opt = q.options[i];
          await safeDb(() =>
            supabase.from("question_options").insert({
              question_version_id: vRes.id,
              option_key: keys[i],
              option_text: opt.text,
              is_correct: opt.correct,
              display_order: i + 1,
            })
          );
        }
      }
    }
  }
  console.log(`4. Successfully Inserted ${insertedCount} Questions, Versions & Options.`);

  // 6. Mock Template & Mock Test Blueprint
  const { data: tplData } = await safeDb(() =>
    supabase
      .from("mock_templates")
      .upsert(
        {
          exam_id: examId,
          title: "SSC CGL Tier-1 Official Blueprint Mini Mock 01",
          slug: "ssc-cgl-tier1-mini-mock-01",
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single()
  );

  const tplId = tplData?.id;

  if (tplId) {
    const { data: mockData, error: mockErr } = await safeDb(() =>
      supabase
        .from("mock_tests")
        .upsert(
          {
            template_id: tplId,
            title: "SSC CGL Tier-1 Official Blueprint Mini Mock 01",
            slug: "ssc-cgl-tier1-mini-mock-01",
            duration_minutes: 30,
            total_questions: insertedCount,
            total_marks: 40,
            is_free: true,
            status: "published",
          },
          { onConflict: "slug" }
        )
        .select("id")
        .single()
    );

    if (mockErr) console.error("Mock Test Error:", mockErr.message);
    else console.log("5. Mock Test ID:", mockData.id);
  }

  // 7. Subscription Plans
  await safeDb(() =>
    supabase.from("subscription_plans").upsert(
      {
        name: "Courage PRO Monthly Pass",
        duration_days: 30,
        base_price_inr: 499,
        is_active: true,
        features_json: ["Access to 500+ Full-Length Mock Tests", "AI Mistake Vault Cognitive Remediation", "Unlimited 1v1 Quiz Battles", "Priority Faculty Evaluation"],
      },
      { onConflict: "name" }
    )
  );
  console.log("6. Verified Subscription Plan.");

  console.log("=== SSC CGL PRODUCTION PILOT SEEDING COMPLETED SUCCESSFULLY ===");
}

seedPilot().catch(console.error);
