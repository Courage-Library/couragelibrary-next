/**
 * Test script to diagnose the runtime error on /current-affairs
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

try {
  global.WebSocket = require('ws');
} catch {}

// Read .env.local
const envPath = path.resolve('e:/Courage Library/.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = val;
        }
      }
    }
  });
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const Module = require('module');
const ts = require('typescript');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const target = path.resolve(__dirname, '..', request.slice(2));
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const fileContent = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(fileContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(compiled.outputText, filename);
};

const { createAdminServerSupabaseClient } = require('@/lib/supabase/server.ts');
const { CurrentAffairsService } = require('@/services/current-affairs.service.ts');

async function testRuntime() {
  console.log('--- TESTING SUPABASE CLIENT DIRECT QUERIES ---');
  const supabase = createAdminServerSupabaseClient();

  console.log('\n1. Testing query from getByDate (supabase):');
  const dateStr = CurrentAffairsService.getTodayDateStr();
  const res1 = await supabase
    .from('current_affairs_articles')
    .select(`
      id,
      slug,
      news_date,
      category,
      importance_tier,
      published_at,
      daily_quiz_mock_id,
      current_affairs_article_versions!fk_ca_articles_published_version (
        headline,
        summary_md,
        key_takeaways
      ),
      current_affairs_sources:current_affairs_sources(count),
      current_affairs_question_mappings:current_affairs_question_mappings(count),
      current_affairs_learning_mappings:current_affairs_learning_mappings(count),
      current_affairs_exam_mappings:current_affairs_exam_mappings(exam_id, is_high_yield, relevance_weight)
    `)
    .eq('news_date', dateStr)
    .eq('status', 'PUBLISHED');

  console.log('getByDate select result:', { error: res1.error, data: res1.data });

  console.log('\n2. Testing query from getHubData recentData (supabase):');
  const res2 = await supabase
    .from('current_affairs_articles')
    .select(`
      id,
      slug,
      news_date,
      category,
      importance_tier,
      published_at,
      current_affairs_article_versions!fk_ca_articles_published_version (
        headline,
        summary_md,
        key_takeaways
      ),
      current_affairs_sources:current_affairs_sources(count),
      current_affairs_question_mappings:current_affairs_question_mappings(count),
      current_affairs_learning_mappings:current_affairs_learning_mappings(count)
    `)
    .eq('status', 'PUBLISHED')
    .order('news_date', { ascending: false })
    .limit(12);

  console.log('getHubData recentData select result:', { error: res2.error, data: res2.data });

  console.log('\n3. Testing CurrentAffairsService.getHubData():');
  try {
    const hubData = await CurrentAffairsService.getHubData();
    console.log('getHubData success:', {
      todayDate: hubData.todayDate,
      todayArticlesCount: hubData.todayFeed.articles.length,
      recentArticlesCount: hubData.recentArticles.length,
      dailyQuizStatus: hubData.dailyQuiz.status,
    });
  } catch (e) {
    console.error('getHubData threw error:', e);
  }

  console.log('\n4. Testing rendering /current-affairs page simulation:');
  try {
    const hubData = await CurrentAffairsService.getHubData();
    const { todayDate, todayFeed, recentArticles, categoryCounts, dailyQuiz } = hubData;

    const istYear = parseInt(todayDate.split('-')[0], 10);
    const istMonth = parseInt(todayDate.split('-')[1], 10);
    const monthSlug = `${istYear}-${String(istMonth).padStart(2, '0')}`;

    // Past 7 days
    const pastDays = [];
    const todayObj = new Date(todayDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayObj.getTime() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      pastDays.push({ date: dateStr });
    }

    console.log('Page simulation rendered successfully without throwing!');
  } catch (e) {
    console.error('Page simulation threw error:', e);
  }
}

testRuntime().catch(console.error);
