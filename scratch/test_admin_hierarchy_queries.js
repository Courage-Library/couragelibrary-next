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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testHierarchy() {
  console.log("=== TESTING ADMIN HIERARCHY QUERIES ===");

  // 1. Categories (Exams)
  const { data: exams } = await supabase.from("exams").select(`
    id,
    title,
    slug,
    category,
    description,
    is_active,
    created_at,
    exam_cycles (
      id,
      cycle_year,
      status,
      exam_patterns (
        id,
        name,
        duration_minutes,
        total_questions,
        total_marks
      )
    ),
    mock_templates (
      id,
      title,
      mock_tests (
        id,
        title,
        status
      )
    )
  `);

  console.log(`1. Categories (Exams) Count: ${exams?.length}`);
  exams?.forEach(e => {
    const patternsCount = e.exam_cycles?.flatMap(c => c.exam_patterns || []).length || 0;
    const mocksCount = e.mock_templates?.flatMap(t => t.mock_tests || []).length || 0;
    console.log(`  - ${e.title} (Slug: ${e.slug}): ${patternsCount} Patterns, ${e.exam_cycles?.length || 0} Schedules, ${mocksCount} Mocks`);
  });

  // 2. Patterns
  const { data: patterns } = await supabase.from("exam_patterns").select(`
    id,
    name,
    tier_name,
    duration_minutes,
    total_questions,
    total_marks,
    negative_mark_value,
    is_active,
    exam_cycles (
      id,
      cycle_year,
      status,
      exams (
        id,
        title,
        slug
      )
    )
  `);

  console.log(`\n2. Patterns Count: ${patterns?.length}`);
  patterns?.forEach(p => {
    console.log(`  - ${p.name} (Exam: ${p.exam_cycles?.exams?.title}): ${p.duration_minutes}m, ${p.total_questions} Qs`);
  });

  // 3. Sections & Subjects
  const { data: subjects } = await supabase.from("subjects").select(`
    id,
    name,
    slug,
    topics (
      id,
      name,
      questions (
        id
      )
    )
  `);
  console.log(`\n3. Sections (Subjects) Count: ${subjects?.length}`);
  subjects?.forEach(s => {
    const qCount = s.topics?.flatMap(t => t.questions || []).length || 0;
    console.log(`  - ${s.name}: ${s.topics?.length || 0} Topics, ${qCount} Questions`);
  });
}

testHierarchy().catch(console.error);
