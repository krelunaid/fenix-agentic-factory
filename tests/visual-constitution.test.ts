import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { challengeAppTypes, createChallengeBrief } from '../lib/visual/challenge';

const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../templates/web-typescript/src/fenix-preview-bridge.ts',import.meta.url),'utf8');
const patches=readFileSync(new URL('../app/api/jobs/[id]/patches/route.ts',import.meta.url),'utf8');
const recovery=readFileSync(new URL('../app/api/jobs/[id]/recovery/route.ts',import.meta.url),'utf8');
const autopilot=readFileSync(new URL('../app/api/jobs/[id]/autopilot/route.ts',import.meta.url),'utf8');

test('01 FENIX palette is canonical',()=>assert.match(css,/--ember: #e36f2f/));
test('02 prohibited AI gradient is absent',()=>assert.doesNotMatch(css,/linear-gradient|radial-gradient/));
test('03 one icon family is used',()=>assert.match(page,/from 'lucide-react'/));
test('04 three visual directions are explicit',()=>['essential','expressive','premium'].forEach(x=>assert.match(page,new RegExp(x))));
test('05 six operational modes exist',()=>['build','focus','visual','debug','compare','mobile'].forEach(x=>assert.match(page,new RegExp(`id:'${x}'`))));
test('06 six viewport classes exist',()=>[375,430,834,1024,1366,1600].forEach(x=>assert.match(page,new RegExp(`width:${x}`))));
test('07 preview and mock are distinguished',()=>assert.match(page,/PREVIEW[\s\S]*MOCK/));
test('08 preview opens separately',()=>assert.match(page,/Apri preview in una nuova finestra/));
test('09 screenshot evidence action exists',()=>assert.match(page,/Acquisisci evidence screenshot/));
test('10 preview bridge announces readiness',()=>assert.match(bridge,/fenix:preview-ready/));
test('11 bridge supports direct selection',()=>assert.match(bridge,/fenix:visual-select/));
test('12 bridge exposes source mapping metadata',()=>assert.match(bridge,/data-fenix-source/));
test('13 visual source is read from sandbox',()=>assert.match(page,/action:'read-file'/));
test('14 patch uses expected hash precondition',()=>assert.match(page,/expectedSha256:sourceDraft.sha256/));
test('15 patch snapshot is durable',()=>assert.match(patches,/fenix-patch-snapshot-v1/));
test('16 recovery point is created automatically',()=>assert.match(patches,/INSERT INTO recovery_points/));
test('17 undo applies server rollback',()=>assert.match(recovery,/apply-rollback/));
test('18 protected files remain immutable',()=>assert.match(recovery,/protected_recovery_path/));
test('19 freeze scope reaches patch policy',()=>assert.match(patches,/sessionFrozenPaths/));
test('20 panels are resizable',()=>assert.match(page,/startResize/));
test('21 mobile keeps all work surfaces reachable',()=>['Chat','Preview','Inspector'].forEach(x=>assert.match(page,new RegExp(`>${x}<`))));
test('22 focus is visible',()=>assert.match(css,/:focus-visible/));
test('23 reduced motion is supported',()=>assert.match(css,/prefers-reduced-motion/));
test('24 design tokens are versioned',()=>assert.match(page,/save-tokens/));
test('25 release remains gated',()=>assert.match(page,/Quality gate e ambienti aperti/));
test('26 project completion is exposed as an explicit action',()=>assert.match(page,/Completa progetto/));
test('27 autopilot executes the sandbox scaffold and preview',()=>['writeFile','corepack','startProcess','sandbox\.preview'].forEach(pattern=>assert.match(autopilot,new RegExp(pattern))));
test('28 autopilot records all release quality gates',()=>['typecheck','lint','unit','build','integration','e2e','accessibility'].forEach(kind=>assert.match(autopilot,new RegExp(`['\"]${kind}['\"]`))));

test('black-box challenge covers ten distinct product structures',()=>{
  const briefs=challengeAppTypes.map(createChallengeBrief);
  assert.equal(briefs.length,10);
  assert.equal(new Set(briefs.map(item=>item.layout)).size,10);
  assert.equal(new Set(briefs.map(item=>item.component)).size,10);
  for(const brief of briefs){assert.deepEqual(brief.viewports,[375,430,834,1024,1366,1600]);assert.equal(brief.states.length,6);assert.ok(brief.accessibility.includes('reduced-motion'));}
});
