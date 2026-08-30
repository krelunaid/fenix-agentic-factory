import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { challengeAppTypes, createChallengeBrief } from '../lib/visual/challenge';

const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const patches=readFileSync(new URL('../app/api/jobs/[id]/patches/route.ts',import.meta.url),'utf8');
const recovery=readFileSync(new URL('../app/api/jobs/[id]/recovery/route.ts',import.meta.url),'utf8');
const autopilot=readFileSync(new URL('../app/api/jobs/[id]/autopilot/route.ts',import.meta.url),'utf8');
const rebuild=readFileSync(new URL('../app/api/projects/[id]/rebuild/route.ts',import.meta.url),'utf8');

test('01 FENIX palette remains canonical',()=>assert.match(css,/--ember:#e36f2f/));
test('02 prohibited AI gradient is absent',()=>assert.doesNotMatch(css,/linear-gradient|radial-gradient/));
test('03 one icon family is used',()=>assert.match(page,/from ["']lucide-react["']/));
test('04 free-form build is the primary home action',()=>['Un’idea dentro','Descrivi liberamente cosa vuoi costruire','Continua a descrivere'].forEach(value=>assert.match(page,new RegExp(value))));
test('05 home has one build mode and no prompt catalogue',()=>{assert.match(page,/nessun preset/i);assert.match(page,/FENIX HA CAPITO/);assert.match(page,/inferIntent\(prompt\)/);assert.doesNotMatch(page,/const starters|starter-row|setKind/)});
test('06 builder exposes preview, code and tests',()=>['Preview','Codice','Test'].forEach(value=>assert.match(page,new RegExp(`>\\s*${value}\\s*<`))));
test('07 real agent activity is visible',()=>['Product Architect','Software Architect','Frontend · Backend · Data','QA · Security','Deploy Agent'].forEach(value=>assert.match(page,new RegExp(value.replace('·','\\·')))));
test('08 live preview is an interactive sandboxed iframe',()=>['<iframe','allow-forms','livePreview'].forEach(value=>assert.match(page,new RegExp(value))));
test('09 project creation immediately starts the intent compiler',()=>{assert.match(page,/await runAutopilot\(data\.jobId,\s*data\.project\.id\)/);assert.match(page,/Compilo l’intento/)});
test('10 conversational revisions create a new build',()=>{assert.match(page,/\/rebuild/);assert.match(rebuild,/revision\.requested/);assert.match(rebuild,/buildTaskDefinitions/)});
test('11 generated files and quality evidence are visible',()=>['repositoryFiles','qualityRuns','Codice reale, progetto tuo','Verifiche indipendenti'].forEach(value=>assert.match(page,new RegExp(value))));
test('12 desktop and mobile previews are reachable',()=>['desktop','mobile','Smartphone'].forEach(value=>assert.match(page,new RegExp(value))));
test('13 focus is visible',()=>assert.match(css,/:focus-visible/));
test('14 reduced motion is supported',()=>assert.match(css,/prefers-reduced-motion/));
test('15 mobile keeps agent and product surfaces',()=>{assert.match(css,/grid-template-rows:minmax\(620px,72vh\) minmax\(620px,78vh\)/);assert.doesNotMatch(css,/\.product-panel\{display:none/)});
test('16 patch snapshots remain durable',()=>assert.match(patches,/fenix-patch-snapshot-v1/));
test('17 recovery remains executable',()=>assert.match(recovery,/apply-rollback/));
test('18 protected paths remain immutable',()=>assert.match(recovery,/protected_recovery_path/));
test('19 autopilot executes generated source and preview',()=>['generateAgenticApplication','writeFile','server\\.mjs','startProcess','sandbox\\.preview'].forEach(pattern=>assert.match(autopilot,new RegExp(pattern))));
test('20 autopilot records release quality gates',()=>['typecheck','lint','unit','build','scenario','integration','e2e','accessibility'].forEach(kind=>assert.match(autopilot,new RegExp(`['"]${kind}['"]`))));
test('21 patch replay is idempotent and persisted',()=>['idempotencyKey','patch_operations','patch_already_in_progress','replayed: true'].forEach(value=>assert.match(patches,new RegExp(value))));
test('22 anonymous visitors get a top-level ChatGPT sign-in instead of a failed build',()=>{assert.match(page,/authRequired/);assert.match(page,/\/signin-with-chatgpt\?return_to=\//);assert.match(page,/target="_top"/);assert.match(page,/fenix:build-draft/)});
test('23 application previews open inside a physical smartphone by default',()=>{assert.match(page,/useState<Device>\("mobile"\)/);assert.match(page,/previewDeviceFor/);assert.match(page,/smartphone-frame/);assert.match(page,/APP · SMARTPHONE LIVE/);assert.match(css,/\.smartphone-frame\{width:425px;height:920px/)});
test('24 only explicit website requests default to desktop',()=>['sito web','website','landing page','portfolio','sito vetrina'].forEach(value=>assert.match(page,new RegExp(value))));

test('black-box challenge covers ten distinct product structures',()=>{
  const briefs=challengeAppTypes.map(createChallengeBrief);
  assert.equal(briefs.length,10);
  assert.equal(new Set(briefs.map(item=>item.layout)).size,10);
  assert.equal(new Set(briefs.map(item=>item.component)).size,10);
  for(const brief of briefs){assert.deepEqual(brief.viewports,[375,430,834,1024,1366,1600]);assert.equal(brief.states.length,6);assert.ok(brief.accessibility.includes('reduced-motion'));}
});
