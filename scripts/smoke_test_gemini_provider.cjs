/**
 * COURAGE LIBRARY — OPT-IN GEMINI PROVIDER SMOKE TEST
 * Phase 3E.3: Production AI Content Generation & Human Review Pipeline
 * 
 * Usage:
 *   node scripts/smoke_test_gemini_provider.cjs
 * 
 * When GEMINI_API_KEY is not set:
 *   Exits gracefully with status 0 and logs "[SKIPPED] GEMINI_API_KEY not found in environment."
 * 
 * When GEMINI_API_KEY is set:
 *   Performs a live test generation call against the configured Gemini model,
 *   validates the response, logs latency, tokens, and model details.
 */

const fs = require('fs');
const path = require('path');

// Zero-dependency .env loader
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {
        // ignore error reading file
      }
    }
  }
}

loadEnv();

async function runSmokeTest() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — GEMINI AI PROVIDER SMOKE TEST');
  console.log('============================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.log('ℹ️  STATUS: [SKIPPED]');
    console.log('   GEMINI_API_KEY is not configured in this environment.');
    console.log('   The test is skipped cleanly without error.');
    console.log('   To run this test against live Gemini API, set GEMINI_API_KEY in .env.local or CI secrets.');
    console.log('\n============================================================');
    console.log('RESULT: SKIPPED (SAFE)');
    console.log('============================================================');
    process.exit(0);
  }

  console.log('🔑 GEMINI_API_KEY detected.');
  const modelId = process.env.GEMINI_MODEL_ID || 'gemini-1.5-pro';
  console.log(`📡 Target Model: ${modelId}`);
  console.log('🚀 Sending live generation probe...\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Return a minimal valid JSON object conforming to: {"status": "ok", "message": "hello courage library"}. Output ONLY raw JSON.',
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
      maxOutputTokens: 100,
    },
  };

  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`❌ HTTP Error ${res.status}: ${res.statusText}`);
      console.error(`   Response snippet: ${errBody.slice(0, 300)}`);
      process.exit(1);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      console.error('❌ Empty candidate text received from Gemini API.');
      process.exit(1);
    }

    let parsed;
    try {
      parsed = JSON.parse(candidateText);
    } catch (e) {
      console.error('❌ Failed to parse response as JSON:', candidateText);
      process.exit(1);
    }

    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;

    console.log('✅ LIVE PROBE SUCCESSFUL!');
    console.log(`   Latency: ${latencyMs}ms`);
    console.log(`   Prompt Tokens: ${promptTokens}`);
    console.log(`   Completion Tokens: ${completionTokens}`);
    console.log(`   Response JSON:`, parsed);
    console.log('\n============================================================');
    console.log('RESULT: PASS (LIVE VERIFIED)');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error(`❌ Network / Execution Error: ${err.message}`);
    process.exit(1);
  }
}

runSmokeTest();
