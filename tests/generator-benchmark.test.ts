import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAgenticApplication, inferProductBrief } from '../lib/build-plane/agentic-generator';
import { benchmarkRubric, compilerCiPromptIds, generatorBenchmarkPrompts } from '../lib/build-plane/generator-benchmark';
import { hasCapability, specificityOracle } from '../lib/build-plane/intent-compiler';

const prompt = (id: string) => {
  const found = generatorBenchmarkPrompts.find((item) => item.id === id);
  assert.ok(found, `missing benchmark prompt ${id}`);
  return found;
};

test('benchmark catalog contains 22 repeatable prompts and a 100-point rubric', () => {
  assert.equal(generatorBenchmarkPrompts.length, 22);
  assert.equal(benchmarkRubric.reduce((total, criterion) => total + criterion.weight, 0), 100);
  assert.deepEqual(compilerCiPromptIds, ['P01', 'P02', 'P14', 'P18', 'P19']);
});

test('P01 compiles to media capabilities and cannot leak cockpit chrome', () => {
  const brief = inferProductBrief('P01', prompt('P01').brief);
  const html = generateAgenticApplication(brief).find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(brief.compiler.grammar.layoutBias[0], 'stage');
  assert.equal(hasCapability(brief.compiler, 'media.hero'), true);
  assert.equal(hasCapability(brief.compiler, 'analytics.cockpit'), false);
  assert.doesNotMatch(html, /aria-label="Metriche operative"|Workspace live|Alpha|Orione|Nova|Atlas/);
  assert.equal(specificityOracle(brief.compiler, html).pass, true);
});

test('P02 composes a service board with specific nouns instead of a staff CRUD', () => {
  const brief = inferProductBrief('P02', prompt('P02').brief);
  const html = generateAgenticApplication(brief).find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(brief.compiler.grammar.layoutBias[0], 'board');
  assert.equal(brief.entity.singular, 'Turno');
  assert.match(html, /Copertura turni e postazioni|sala e cucina/i);
  assert.doesNotMatch(html, /Workspace live|Elemento|Alpha|Metriche operative/);
});

test('P14 composes an atelier and persists compiler IR artifacts', () => {
  const brief = inferProductBrief('P14', prompt('P14').brief);
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(brief.compiler.grammar.layoutBias[0], 'atelier');
  assert.equal(hasCapability(brief.compiler, 'canvas.compose'), true);
  assert.match(html, /Atelier locandine|poster-canvas|Esporta PDF/);
  for (const path of ['fenix.intent-graph.json', 'fenix.capability-graph.json', 'fenix.interaction-model.json', 'fenix.design-grammar.json', 'fenix.specificity.json']) {
    assert.ok(files.some((file) => file.path === path), `${path} should be persisted`);
  }
});

test('P18 is the positive control: an explicitly requested dashboard gets a cockpit', () => {
  const brief = inferProductBrief('P18', prompt('P18').brief);
  const html = generateAgenticApplication(brief).find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(brief.compiler.grammar.layoutBias[0], 'cockpit');
  assert.equal(hasCapability(brief.compiler, 'analytics.cockpit'), true);
  assert.match(html, /Dashboard vendite e KPI|Funnel vendite|Metriche operative/);
});

test('P19 stops at the intent gate instead of silently inventing a SaaS dashboard', () => {
  const brief = inferProductBrief('P19', prompt('P19').brief);
  assert.equal(brief.compiler.intent.requiresConfirmation, true);
  assert.ok(brief.compiler.intent.ambiguity.length >= 1);
  assert.equal(hasCapability(brief.compiler, 'analytics.cockpit'), false);
});
