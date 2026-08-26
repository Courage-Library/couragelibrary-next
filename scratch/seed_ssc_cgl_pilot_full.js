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

async function runFullSeed() {
  console.log("=== SEEDING REMAINING PILOT DOMAINS ===");

  // 1. Learning Resource + Article & Version
  const { data: lrData, error: lrErr } = await safeDb(() =>
    supabase
      .from("learning_resources")
      .insert({
        resource_type: "ARTICLE",
        slug: "vedic-mathematics-shortcuts-ssc-cgl",
        title: "Mastering Vedic Mathematics Shortcuts for SSC CGL Quant",
        description: "High-speed mental math techniques for multiplication, square roots, and digital roots in SSC examinations.",
        access_level: "FREE",
        status: "PUBLISHED",
      })
      .select("id")
      .single()
  );

  if (lrErr) console.error("LR error:", lrErr.message);
  else if (lrData) {
    const { data: artData, error: artErr } = await safeDb(() =>
      supabase
        .from("articles")
        .insert({
          learning_resource_id: lrData.id,
          slug: "vedic-mathematics-shortcuts-ssc-cgl",
          reading_time_minutes: 8,
          status: "PUBLISHED",
        })
        .select("id")
        .single()
    );

    if (artErr) console.error("Article error:", artErr.message);
    else if (artData) {
      await safeDb(() =>
        supabase.from("article_versions").insert({
          article_id: artData.id,
          version_number: 1,
          content_markdown: `# Vedic Mathematics Shortcuts for SSC Quant\n\nSpeed and accuracy in Quantitative Aptitude are decisive factors in SSC CGL.\n\n## 1. Digital Root Method\nDigital root is the single-digit sum obtained by adding all digits of a number continuously until a single digit remains.\n\n## 2. Base Multiplication (Near 100)\nTo multiply numbers close to 100 like 97 x 96:\n- Deficits: -3 and -4\n- Cross subtraction: 97 - 4 = 93\n- Product of deficits: (-3) x (-4) = 12\n- Answer: **9312**`,
        })
      );
      console.log("1. Inserted Learning Resource, Article & Version 1.");
    }
  }

  console.log("=== FULL SEED COMPLETED SUCCESSFULLY ===");
}

runFullSeed().catch(console.error);
