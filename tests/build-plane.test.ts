import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepositoryIndex, normalizeRepositoryPath } from '../lib/build-plane/repo-index';
import { validatePatch } from '../lib/build-plane/patch-policy';
import { forkRecoveryPoint, selectRollbackPath, type RecoveryPoint } from '../lib/build-plane/recovery';
import { evaluateReleaseEvidence } from '../lib/build-plane/quality';
import { deriveSandboxId } from '../lib/build-plane/sandbox-id';
import { createScaffoldPlan, validateScaffoldManifest } from '../lib/build-plane/scaffold';

test('sandbox identifiers are stable and isolated by scope', async () => {
  const first = await deriveSandboxId({ organizationId: 'org-1', projectId: 'project-1', jobId: 'job-1' });
  const same = await deriveSandboxId({ organizationId: 'org-1', projectId: 'project-1', jobId: 'job-1' });
  const other = await deriveSandboxId({ organizationId: 'org-1', projectId: 'project-1', jobId: 'job-2' });
  assert.match(first, /^fnx-[a-f0-9]{24}$/);
  assert.equal(first, same);
  assert.notEqual(first, other);
});

test('repository index normalizes paths and marks generated files', () => {
  const index = buildRepositoryIndex([
    { path: './app/page.tsx', byteSize: 10, sha256: 'a' },
    { path: 'dist/app.js', byteSize: 20, sha256: 'b' },
  ]);
  assert.equal(index[0].path, 'app/page.tsx');
  assert.equal(index[0].language, 'TypeScript React');
  assert.equal(index[1].generated, true);
  assert.throws(() => normalizeRepositoryPath('../secret'), /path_outside_repository/);
});

test('patch policy enforces scope, preconditions and frozen paths', () => {
  const policy = { allowedGlobs: ['app/**', 'lib/*.ts'], frozenPaths: ['app/auth'], maxFiles: 4, allowDelete: false, allowGenerated: false };
  const accepted = validatePatch([{ path: 'app/page.tsx', operation: 'update', expectedSha256: 'before', contentSha256: 'after' }], policy);
  assert.equal(accepted[0].path, 'app/page.tsx');
  assert.throws(() => validatePatch([{ path: 'app/auth/route.ts', operation: 'create', contentSha256: 'after' }], policy), /path_frozen/);
  assert.throws(() => validatePatch([{ path: 'README.md', operation: 'create', contentSha256: 'after' }], policy), /path_not_allowed/);
});

test('recovery only rolls back through ancestors and forks into another job', () => {
  const root: RecoveryPoint = { id: 'r1', projectId: 'p1', jobId: 'j1', parentId: null, sourceRevision: 'a', artifactId: 'x', createdAt: 1 };
  const child: RecoveryPoint = { ...root, id: 'r2', parentId: 'r1', sourceRevision: 'b', createdAt: 2 };
  const leaf: RecoveryPoint = { ...root, id: 'r3', parentId: 'r2', sourceRevision: 'c', createdAt: 3 };
  assert.deepEqual(selectRollbackPath([root, child, leaf], 'r3', 'r1').map((point) => point.id), ['r3', 'r2', 'r1']);
  assert.equal(forkRecoveryPoint(child, 'fork-1', 'j2', 4).parentId, 'r2');
  assert.throws(() => selectRollbackPath([root, child, leaf], 'r1', 'r3'), /target_not_ancestor/);
});

test('release evidence is fail-closed', () => {
  const checks = ['typecheck', 'lint', 'unit', 'integration', 'e2e', 'accessibility'].map((kind) => ({
    kind: kind as 'typecheck', status: 'passed' as const, durationMs: 1, artifactIds: [`artifact-${kind}`], summary: 'ok',
  }));
  const verdict = evaluateReleaseEvidence(checks, [{ id: 'e1', checkKind: 'e2e', claim: 'critical flow works', status: 'verified', artifactIds: ['trace-1'], createdAt: 1 }]);
  assert.equal(verdict.releasable, true);
  assert.equal(evaluateReleaseEvidence(checks.slice(1), []).releasable, false);
});

test('scaffold manifest is complete and produces a gated build DAG', () => {
  const manifest = {
    templateVersion: '1.0.0' as const,
    runtime: 'cloudflare-workers' as const,
    packageManager: 'pnpm' as const,
    healthPath: '/api/health',
    requiredFiles: ['package.json', 'src/App.tsx'],
    qualityCommands: { typecheck: ['pnpm', 'typecheck'], lint: ['pnpm', 'lint'], unit: ['pnpm', 'test'], build: ['pnpm', 'build'] },
  };
  assert.equal(validateScaffoldManifest(manifest, ['package.json', 'src/App.tsx']).valid, true);
  const plan = createScaffoldPlan(manifest);
  assert.deepEqual(plan.at(-1)?.dependsOn, ['typecheck', 'lint', 'unit']);
});
