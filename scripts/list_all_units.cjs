
global.WebSocket = class WebSocket {};
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')).split('=')[1].trim().replace(/"/g, '');
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')).split('=')[1].trim().replace(/"/g, '');
const supabase = createClient(url, key);

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
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  return module._compile(compiled.outputText, filename);
};

const { CurriculumCoverageService } = require('@/services/curriculum-coverage.service');

async function run() {
  const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(supabase);
  const list = [];
  for (const s of matrix.subjects) {
    for (const t of s.topics) {
      for (const u of t.units) {
        list.push({
          subjectName: s.subjectName,
          topicName: t.topicName,
          unitTitle: u.unitTitle,
          unitSlug: u.unitSlug,
          unitId: u.unitId,
          questions: u.linkedQuestionCount,
        });
      }
    }
  }
  console.log(JSON.stringify(list, null, 2));
}
run();
