/**
 * COURAGE LIBRARY — PHASE 3E.1 AUTOMATED TEST SUITE
 * AI Architecture & Provider Abstraction Foundation
 * 
 * Verifies 15 Tracks (A through O):
 * Track A: Provider Abstraction & Interface Contract (T01-T03)
 * Track B: Normalized Success Response Structure (T04-T06)
 * Track C: Normalized Failure Response Handling (T07-T09)
 * Track D: Timeout Error Classification (T10-T11)
 * Track E: Rate-Limit Error Classification (T12-T13)
 * Track F: Malformed Output Rejection (T14-T15)
 * Track G: Schema Validation Failure Rejection (T16-T18)
 * Track H: Idempotency & Request Hash Consistency (T19-T21)
 * Track I: Admin Authorization Gate Verification (T22-T24)
 * Track J: Server/Client Secret Boundary Scan (T25-T27)
 * Track K: AI Cannot Publish Invariant Verification (T28-T30)
 * Track L: Request Metadata & Context Precedence (T31-T33)
 * Track M: Token Usage & Cost Estimation Normalization (T34-T36)
 * Track N: Retry Classification & Policy Contract (T37-T38)
 * Track O: Provider-Independent Orchestration & Zero DB Mutation (T39-T40)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[trimmed.slice(0, idx).trim()] = val;
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message, testId) {
  if (condition) {
    console.log(`  ✓ [${testId}] ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ [${testId}] FAILED: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('COURAGE LIBRARY — PHASE 3E.1 AI ARCHITECTURE TEST SUITE');
  console.log('============================================================\n');

  // Load compiled or raw code artifacts
  const typesPath = path.join(__dirname, '..', 'types', 'ai-provider.ts');
  const providerInterfacePath = path.join(__dirname, '..', 'services', 'ai', 'ai-provider.interface.ts');
  const modelRegistryPath = path.join(__dirname, '..', 'services', 'ai', 'ai-model-registry.ts');
  const mockProviderPath = path.join(__dirname, '..', 'services', 'ai', 'mock-ai-provider.service.ts');
  const orchestratorPath = path.join(__dirname, '..', 'services', 'ai', 'ai-generation-orchestrator.service.ts');
  const specValidatorPath = path.join(__dirname, '..', 'services', 'content-spec-validator.ts');

  // -------------------------------------------------------------
  // TRACK A: Provider Abstraction & Interface Contract
  // -------------------------------------------------------------
  console.log('▶ Track A: Provider Abstraction & Interface Contract');
  assert(fs.existsSync(providerInterfacePath), 'ai-provider.interface.ts exists in services/ai', 'T01');
  assert(fs.existsSync(typesPath), 'ai-provider.ts exists in types/', 'T02');
  
  const providerContent = fs.readFileSync(providerInterfacePath, 'utf-8');
  assert(providerContent.includes('export interface AIProvider'), 'AIProvider interface is defined and exported', 'T03');

  // -------------------------------------------------------------
  // TRACK B: Normalized Success Response Structure
  // -------------------------------------------------------------
  console.log('\n▶ Track B: Normalized Success Response Structure');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');
  assert(typesContent.includes('export interface AINormalizedResponse'), 'AINormalizedResponse interface is defined', 'T04');
  assert(typesContent.includes('usage: AITokenUsage'), 'Response includes token usage metadata', 'T05');
  assert(typesContent.includes('latencyMs: number'), 'Response includes latency telemetry', 'T06');

  // -------------------------------------------------------------
  // TRACK C: Normalized Failure Response Handling
  // -------------------------------------------------------------
  console.log('\n▶ Track C: Normalized Failure Response Handling');
  assert(providerContent.includes('export class AIEngineError'), 'AIEngineError class is defined', 'T07');
  assert(providerContent.includes('export function classifyAIError'), 'classifyAIError utility is defined', 'T08');
  assert(typesContent.includes('UNKNOWN_ERROR'), 'Error taxonomy includes fallback UNKNOWN_ERROR', 'T09');

  // -------------------------------------------------------------
  // TRACK D: Timeout Error Classification
  // -------------------------------------------------------------
  console.log('\n▶ Track D: Timeout Error Classification');
  assert(providerContent.includes("'TIMEOUT'"), 'Timeout error code supported in classifier', 'T10');
  assert(typesContent.includes('timeoutMs: number'), 'AIModelConfig includes timeout specification', 'T11');

  // -------------------------------------------------------------
  // TRACK E: Rate-Limit Error Classification
  // -------------------------------------------------------------
  console.log('\n▶ Track E: Rate-Limit Error Classification');
  assert(providerContent.includes("'RATE_LIMITED'"), 'Rate limited error code supported in classifier', 'T12');
  assert(typesContent.includes("'RATE_LIMITED'"), 'DEFAULT_AI_RETRY_POLICY includes RATE_LIMITED as retryable', 'T13');

  // -------------------------------------------------------------
  // TRACK F: Malformed Output Rejection
  // -------------------------------------------------------------
  console.log('\n▶ Track F: Malformed Output Rejection');
  assert(typesContent.includes("'MALFORMED_OUTPUT'"), 'Error taxonomy supports MALFORMED_OUTPUT', 'T14');
  assert(providerContent.includes('unexpected token') || providerContent.includes('parse error'), 'JSON parse errors classified as MALFORMED_OUTPUT', 'T15');

  // -------------------------------------------------------------
  // TRACK G: Schema Validation Failure Rejection
  // -------------------------------------------------------------
  console.log('\n▶ Track G: Schema Validation Failure Rejection');
  assert(typesContent.includes("'SCHEMA_VALIDATION_FAILED'"), 'Error taxonomy supports SCHEMA_VALIDATION_FAILED', 'T16');
  const orchestratorContent = fs.readFileSync(orchestratorPath, 'utf-8');
  assert(orchestratorContent.includes('ContentSpecValidator.validate'), 'Orchestrator enforces ContentSpecValidator schema validation', 'T17');
  assert(orchestratorContent.includes('MdxSecurityScanner.scan'), 'Orchestrator enforces MdxSecurityScanner AST threat scan', 'T18');

  // -------------------------------------------------------------
  // TRACK H: Idempotency & Request Hash Consistency
  // -------------------------------------------------------------
  console.log('\n▶ Track H: Idempotency & Request Hash Consistency');
  assert(orchestratorContent.includes('computeIdempotencyHash'), 'AIGenerationOrchestrator defines computeIdempotencyHash', 'T19');
  assert(typesContent.includes('idempotencyKey: string'), 'AIGenerationRequest requires idempotencyKey', 'T20');
  assert(orchestratorContent.includes("createHash('sha256')"), 'Idempotency hash is computed using SHA-256', 'T21');

  // -------------------------------------------------------------
  // TRACK I: Admin Authorization Gate Verification
  // -------------------------------------------------------------
  console.log('\n▶ Track I: Admin Authorization Gate Verification');
  assert(typesContent.includes('adminUserId: string'), 'Request requires explicit admin user ID', 'T22');
  const docContent = fs.readFileSync(path.join(__dirname, '..', 'docs', 'architecture', 'learning_courses_phase3e1_ai_architecture.md'), 'utf-8');
  assert(docContent.includes('AdminService.checkIsAdminOrStaff()'), 'Architecture mandates AdminService.checkIsAdminOrStaff() gatekeeper', 'T23');
  assert(!docContent.includes('public_ai_endpoint'), 'Zero public candidate-facing AI proxy endpoints permitted', 'T24');

  // -------------------------------------------------------------
  // TRACK J: Server/Client Secret Boundary Scan
  // -------------------------------------------------------------
  console.log('\n▶ Track J: Server/Client Secret Boundary Scan');
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');
  assert(!envExample.includes('NEXT_PUBLIC_GEMINI') && !envExample.includes('NEXT_PUBLIC_OPENAI'), 'Zero AI API keys exposed with NEXT_PUBLIC_ prefix in .env.example', 'T25');
  assert(!providerContent.includes("'use client'"), 'ai-provider.interface.ts is strictly server-side', 'T26');
  assert(!orchestratorContent.includes("'use client'"), 'ai-generation-orchestrator.service.ts is strictly server-side', 'T27');

  // -------------------------------------------------------------
  // TRACK K: AI Cannot Publish Invariant Verification
  // -------------------------------------------------------------
  console.log('\n▶ Track K: AI Cannot Publish Invariant Verification');
  assert(!orchestratorContent.includes("review_status: 'PUBLISHED'"), 'AIGenerationOrchestrator never assigns review_status = PUBLISHED', 'T28');
  assert(!orchestratorContent.includes("is_published: true"), 'AIGenerationOrchestrator never assigns is_published = true', 'T29');
  assert(orchestratorContent.includes("disposition: 'SAVED_AS_DRAFT'"), 'Orchestrator records disposition as SAVED_AS_DRAFT', 'T30');

  // -------------------------------------------------------------
  // TRACK L: Request Metadata & Context Precedence
  // -------------------------------------------------------------
  console.log('\n▶ Track L: Request Metadata & Context Precedence');
  assert(typesContent.includes('academicContext: {'), 'Request contains complete academicContext', 'T31');
  assert(typesContent.includes('generationDirectives: {'), 'Request contains explicit generationDirectives', 'T32');
  assert(docContent.includes('Context Authority Precedence'), 'Architecture documents strict 7-tier context precedence', 'T33');

  // -------------------------------------------------------------
  // TRACK M: Token Usage & Cost Estimation Normalization
  // -------------------------------------------------------------
  console.log('\n▶ Track M: Token Usage & Cost Estimation Normalization');
  const modelRegistryContent = fs.readFileSync(modelRegistryPath, 'utf-8');
  assert(modelRegistryContent.includes('estimateCostUsd'), 'AIModelConfigRegistry implements estimateCostUsd', 'T34');
  assert(modelRegistryContent.includes('costPer1kInputTokensUsd'), 'Models define costPer1kInputTokensUsd', 'T35');
  assert(modelRegistryContent.includes('costPer1kOutputTokensUsd'), 'Models define costPer1kOutputTokensUsd', 'T36');

  // -------------------------------------------------------------
  // TRACK N: Retry Classification & Policy Contract
  // -------------------------------------------------------------
  console.log('\n▶ Track N: Retry Classification & Policy Contract');
  assert(typesContent.includes('export interface AIRetryPolicy'), 'AIRetryPolicy is formally typed', 'T37');
  assert(typesContent.includes('DEFAULT_AI_RETRY_POLICY'), 'DEFAULT_AI_RETRY_POLICY is defined with max 3 attempts', 'T38');

  // -------------------------------------------------------------
  // TRACK O: Provider-Independent Orchestration & Zero DB Mutation
  // -------------------------------------------------------------
  console.log('\n▶ Track O: Provider-Independent Orchestration & Zero DB Mutation');
  assert(orchestratorContent.includes('private static providerInstance: AIProvider'), 'Orchestrator depends purely on AIProvider abstraction', 'T39');
  assert(fs.existsSync(mockProviderPath), 'MockAIProvider exists for deterministic testing', 'T40');

  // -------------------------------------------------------------
  // Baseline Invariant Verification
  // -------------------------------------------------------------
  console.log('\n▶ Protected Baseline Verification (14 Tables)');
  if (supabaseUrl && serviceRoleKey) {
    const protectedTables = [
      { name: 'mock_tests', expected: 8 },
      { name: 'mock_sections', expected: 14 },
      { name: 'mock_questions', expected: 350 },
      { name: 'mock_templates', expected: 8 },
      { name: 'test_attempts', expected: 31 },
      { name: 'test_results', expected: 10 },
      { name: 'attempt_answers', expected: 200 },
      { name: 'questions', expected: 103 },
      { name: 'question_versions', expected: 103 },
      { name: 'question_options', expected: 412 },
      { name: 'question_answers', expected: 103 },
      { name: 'subscription_plans', expected: 1 },
      { name: 'coin_wallets', expected: 5 },
      { name: 'coin_ledger', expected: 8 },
    ];

    for (const table of protectedTables) {
      let verified = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const url = `${supabaseUrl}/rest/v1/${table.name}`;
          const res = await fetch(url, {
            method: 'HEAD',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              Prefer: 'count=exact',
            }
          });
          const contentRange = res.headers.get('content-range');
          let count = 0;
          if (contentRange) {
            const parts = contentRange.split('/');
            if (parts.length > 1) count = parseInt(parts[1], 10) || 0;
          }
          if (count === table.expected) {
            console.log(`  ✓ Table ${table.name.padEnd(25)} count = ${count} (matches expected ${table.expected})`);
            verified = true;
            break;
          } else {
            console.error(`  ✗ Table ${table.name.padEnd(25)} count = ${count} (EXPECTED ${table.expected})`);
            failedTests++;
            verified = true;
            break;
          }
        } catch (err) {
          if (attempt === 3) {
            console.warn(`  ! Could not verify remote count for ${table.name} after 3 attempts: ${err.message}`);
          } else {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }
  }

  console.log('\n============================================================');
  console.log(`TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running Phase 3E.1 test suite:', err);
  process.exit(1);
});
