import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPatchSet,
  attachAgenticExperience,
  classifyBuildComplexity,
  createHybridFilePlan,
  fallbackExperienceFiles,
  parseAgenticPatchSet,
  parseQaDiagnosis,
  parseRepairSet,
} from '../lib/build-plane/agentic-pipeline';
import { generateAgenticApplication, inferProductBrief } from '../lib/build-plane/agentic-generator';
import { buildDurablePreviewHtml } from '../lib/build-plane/durable-preview';

function validCandidate() {
  return {
    rationale: 'Esperienza specifica e accessibile',
    patches: [
      {
        op: 'write',
        path: 'public/experience.css',
        purpose: 'Direzione visiva',
        content: ':root{--generated:#267052}.domain-card{display:grid}@media(prefers-reduced-motion:reduce){.domain-card{transition:none}}',
      },
      {
        op: 'write',
        path: 'public/experience.js',
        purpose: 'Interazione di dominio',
        content: "const app=document.querySelector('#app');app?.setAttribute('data-agentic-experience','ready');window.parent?.postMessage({type:'fenix:experience-ready'},'*');",
      },
    ],
  };
}

test('complexity classifier raises the budget only for real scope signals', () => {
  const small = inferProductBrief('Piante', 'Diario semplice per annaffiare le piante');
  const large = { ...small, summary: 'Marketplace realtime multi-tenant con pagamenti, upload e OAuth' };
  assert.equal(classifyBuildComplexity(small).tier, 'small');
  assert.equal(classifyBuildComplexity(large).tier, 'large');
  assert.ok(classifyBuildComplexity(large).maxWallClockMs > classifyBuildComplexity(small).maxWallClockMs);
});

test('schema-bound Builder accepts only the two planned executable files', () => {
  const brief = inferProductBrief('Piante', 'App per curare piante');
  const plan = createHybridFilePlan(brief);
  const patch = parseAgenticPatchSet(validCandidate(), plan, classifyBuildComplexity(brief));
  assert.deepEqual(patch.patches.map((item) => item.path), ['public/experience.css', 'public/experience.js']);
  assert.equal(patch.attempt, 1);
});

test('sanitize gate rejects traversal, external code, secrets and unsafe execution', () => {
  const brief = inferProductBrief('Piante', 'App per curare piante');
  const plan = createHybridFilePlan(brief);
  const budget = classifyBuildComplexity(brief);
  const traversal = validCandidate();
  traversal.patches[0].path = '../.env';
  assert.throws(() => parseAgenticPatchSet(traversal, plan, budget), /path_outside_workspace/);

  for (const unsafe of [
    "fetch('https://evil.example')",
    "eval('alert(1)')",
    "const api_key='super-secret-value'",
  ]) {
    const candidate = validCandidate();
    candidate.patches[1].content = `${unsafe};window.parent?.postMessage({type:'fenix:experience-ready'},'*');`;
    assert.throws(() => parseAgenticPatchSet(candidate, plan, budget), /agentic_(external_network|unsafe_primitive|secret_detected)/);
  }
});

test('invalid Builder output cannot partially write a PatchSet', () => {
  const brief = inferProductBrief('Spesa', 'Lista della spesa');
  const candidate = validCandidate();
  candidate.patches.pop();
  assert.throws(() => parseAgenticPatchSet(candidate, createHybridFilePlan(brief), classifyBuildComplexity(brief)), /required_file_missing/);
});

test('repair is bound to diagnosed suspect files and root causes', () => {
  const brief = inferProductBrief('Piante', 'App per curare piante');
  const plan = createHybridFilePlan(brief);
  const budget = classifyBuildComplexity(brief);
  const failure = { check: 'agentic-code', stdout: '', stderr: 'SyntaxError near line 8', exitCode: 1 };
  const diagnosis = parseQaDiagnosis({
    rootCauses: [{ id: 'RC1', severity: 'blocker', evidence: failure.stderr, suspectFiles: ['public/experience.js'], hypothesis: 'Parentesi non chiusa' }],
    repairGoal: 'Ripristinare JavaScript sintatticamente valido',
  }, failure, plan.files.map((file) => file.path), 1);
  const repair = parseRepairSet({
    rationale: 'Corregge la sintassi',
    repairs: ['RC1'],
    expectedChecksToFlip: ['agentic-code'],
    patches: [{ path: 'public/experience.js', purpose: 'Fix sintassi', content: "document.documentElement.dataset.repaired='true';window.parent?.postMessage({type:'fenix:experience-ready'},'*');" }],
  }, plan, budget, diagnosis, 1);
  assert.equal(repair.patches[0]?.path, 'public/experience.js');

  const unrelated = { ...repair, patches: [{ ...repair.patches[0]!, path: 'public/experience.css', content: ':root{}@media(prefers-reduced-motion:reduce){*{transition:none}}' }] };
  assert.throws(() => parseRepairSet(unrelated, plan, budget, diagnosis, 1), /repair_outside_diagnosis/);
});

test('hybrid files are attached to the real preview and can be replaced atomically', () => {
  const brief = inferProductBrief('Piante', 'App per curare piante');
  const base = generateAgenticApplication(brief);
  const rescue = attachAgenticExperience(base, fallbackExperienceFiles(brief), 'rescue');
  const html = rescue.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.match(html, /data-builder-mode="rescue"/);
  assert.match(html, /\/experience\.css/);
  assert.match(html, /\/experience\.js/);

  const patch = parseAgenticPatchSet(validCandidate(), createHybridFilePlan(brief), classifyBuildComplexity(brief));
  const updated = applyPatchSet(rescue, patch);
  assert.match(updated.find((file) => file.path === 'public/experience.js')?.content ?? '', /data-agentic-experience/);
  const durable = buildDurablePreviewHtml({ productBrief: brief, files: updated }, '/preview/p1?token=signed');
  assert.match(durable, /data-agentic-experience/);
  assert.match(durable, /--generated:#267052/);
  assert.doesNotMatch(durable, /src="\/experience\.js"/);
  assert.doesNotMatch(durable, /href="\/experience\.css"/);
});
