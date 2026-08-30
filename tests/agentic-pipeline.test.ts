import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPatchSet,
  attachAgenticExperience,
  builderFilePrompt,
  classifyBuildComplexity,
  createHybridFilePlan,
  createSourceAccessibilityEvidence,
  evaluateExperienceQuality,
  fallbackExperienceFiles,
  normalizeGeneratedFileContent,
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
        content: `:root{--generated:#267052}.product-view .domain-card{display:grid;gap:12px;padding:16px;border-radius:20px;background:linear-gradient(145deg,#fff,#eef8f2);box-shadow:0 16px 36px #17251d1c;transition:transform .2s ease}.product-view .domain-card:focus-visible{outline:3px solid var(--generated)}@media(max-width:640px){.product-view .domain-card{padding:14px}}@media(prefers-reduced-motion:reduce){.product-view .domain-card{transition:none}}`,
      },
      {
        op: 'write',
        path: 'public/experience.js',
        purpose: 'Interazione di dominio',
        content: "const card=document.querySelector('.domain-card');document.documentElement.dataset.agenticExperience='ready';card?.setAttribute('data-agentic-experience','ready');card?.addEventListener('click',()=>card.setAttribute('data-active','true'));window.parent?.postMessage({type:'fenix:experience-ready'},'*');",
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

test('single-file AI passes accept raw or fenced source without JSON escaping', () => {
  assert.match(normalizeGeneratedFileContent('```css\n:root{color:red}\n```', 'public/experience.css'), /prefers-reduced-motion/);
  assert.match(normalizeGeneratedFileContent("document.body.dataset.ready='1'", 'public/experience.js'), /fenix:experience-ready/);
  assert.throws(() => normalizeGeneratedFileContent('   ', 'public/experience.js'), /file_empty/);
});

test('JavaScript Builder contract requires JavaScript rather than raw icon markup', () => {
  const brief = inferProductBrief('Musica', 'Collezione di album');
  const entry = createHybridFilePlan(brief).files.find((file) => file.path.endsWith('.js'))!;
  const prompt = builderFilePrompt(brief, entry);
  assert.match(prompt, /valid ECMAScript only/);
  assert.match(prompt, /never output raw HTML, XML or SVG/);
  assert.doesNotMatch(prompt, /<svg><use/);
});

test('CSS normalization removes model-added remote resources before the strict gate', () => {
  const raw = `/* generated visual system; never use https://docs.example */
@import url('https://fonts.example/inter.css');
:root{--accent:#267052;background-image:url("https://images.example/leaf.png")}
.domain-card{display:grid}`;
  const normalized = normalizeGeneratedFileContent(raw, 'public/experience.css');
  assert.doesNotMatch(normalized, /https?:\/\//);
  assert.match(normalized, /\.domain-card\{display:grid\}/);
  const candidate = validCandidate();
  candidate.patches[0].content = normalized;
  const brief = inferProductBrief('Piante', 'App per curare piante');
  assert.doesNotThrow(() => parseAgenticPatchSet(candidate, createHybridFilePlan(brief), classifyBuildComplexity(brief)));
});

test('JavaScript normalization neutralizes remote literals without relaxing direct patch validation', () => {
  const raw = `/* see https://docs.example */
const image = "https://images.example/plant.png";
document.body.dataset.image = image; // https://comment.example
window.parent?.postMessage({type:'fenix:experience-ready'},'*');`;
  const normalized = normalizeGeneratedFileContent(raw, 'public/experience.js');
  assert.doesNotMatch(normalized, /https?:\/\//);
  assert.match(normalized, /const image = "data:,"/);
  const candidate = validCandidate();
  candidate.patches[1].content = normalized;
  const brief = inferProductBrief('Piante', 'App per curare piante');
  assert.doesNotThrow(() => parseAgenticPatchSet(candidate, createHybridFilePlan(brief), classifyBuildComplexity(brief)));
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

test('experience quality rejects the raw form replacement shown by the mobile regression', () => {
  const brief = inferProductBrief('app per muratori', 'Applicazione mobile per gestire un cantiere');
  const raw = [
    { path: 'public/experience.css', content: 'body{margin:0}input{width:100%}@media(prefers-reduced-motion:reduce){*{transition:none}}' },
    { path: 'public/experience.js', content: "const app=document.querySelector('#app');app.innerHTML='<h1>App per muratori</h1><form><input><button>Crea attività</button></form>';window.parent?.postMessage({type:'fenix:experience-ready'},'*');" },
  ];
  const result = evaluateExperienceQuality(brief, raw);
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('preservesApplication'));
  assert.ok(result.failures.includes('visualSystem'));
});

test('verified fallback exposes durable WCAG evidence when the visual provider omits its optional audit payload', () => {
  const brief = inferProductBrief('app per muratori', 'Applicazione mobile per gestire un cantiere');
  const files = attachAgenticExperience(generateAgenticApplication(brief), fallbackExperienceFiles(brief), 'rescue');
  const evidence = createSourceAccessibilityEvidence(files);
  assert.equal(evidence?.source, 'verified-source-contract');
  assert.equal(evidence?.checks.visibleFocus, true);
  assert.equal(evidence?.checks.touchTargets, true);
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
