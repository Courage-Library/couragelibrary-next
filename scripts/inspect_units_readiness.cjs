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
const { CanonicalCurriculumBlueprintService } = require('@/services/canonical-curriculum-blueprint.service');
const { AuthoringQueueService } = require('@/services/authoring-queue.service');

async function run() {
  const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(supabase);
  const queue = await AuthoringQueueService.getAuthoringQueue(supabase);

  console.log('Total units in matrix:', matrix.overall.totalUnits);
  console.log('Total tasks in queue:', queue.length);

  const unitsSummary = [];
  for (const subject of matrix.subjects) {
    for (const topic of subject.topics) {
      for (const unit of topic.units) {
        const readiness = await CanonicalCurriculumBlueprintService.evaluateAuthoringReadiness(unit.unitId, supabase);
        unitsSummary.push({
          unitId: unit.unitId,
          unitTitle: unit.unitTitle,
          unitSlug: unit.unitSlug,
          topicId: unit.topicId,
          topicName: unit.topicName,
          subjectId: unit.subjectId,
          subjectName: unit.subjectName,
          linkedQuestionCount: unit.linkedQuestionCount,
          mappedExams: unit.mappedExams,
          publishedDocCount: unit.publishedDocCount,
          readinessState: readiness.readinessState,
          readinessReasons: readiness.reasons,
          docTypes: unit.documentTypes,
        });
      }
    }
  }

  console.log('\n--- DETAILED CANONICAL UNITS AUDIT ---');
  unitsSummary.forEach((u, i) => {
    console.log(`[${i + 1}] ${u.subjectName} > ${u.topicName} > ${u.unitTitle} (${u.unitSlug})`);
    console.log(`    Unit ID: ${u.unitId}`);
    console.log(`    Readiness: ${u.readinessState} | Questions: ${u.linkedQuestionCount} | Published Docs: ${u.publishedDocCount}`);
    console.log(`    Reasons:`, u.readinessReasons);
    console.log(`    Doc Slots:`, Object.entries(u.docTypes).map(([dt, slot]) => `${dt}:${slot.status}`).join(', '));
  });
}

run().catch(console.error);
