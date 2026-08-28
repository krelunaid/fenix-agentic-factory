import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepositoryIndex, normalizeRepositoryPath } from '../lib/build-plane/repo-index';
import { validatePatch } from '../lib/build-plane/patch-policy';
import { forkRecoveryPoint, selectRollbackPath, type RecoveryPoint } from '../lib/build-plane/recovery';
import { evaluateReleaseEvidence } from '../lib/build-plane/quality';
import { deriveSandboxId } from '../lib/build-plane/sandbox-id';
import { createScaffoldPlan, validateScaffoldManifest } from '../lib/build-plane/scaffold';
import { reconcileAICost, routeModel } from '../lib/ai-gateway/router';
import { redactSecrets, requiresApproval, validateIdempotencyKey } from '../lib/integrations/policy';
import { createPullRequestSummary, validatePushPlan } from '../lib/source-control/policy';
import { evaluateReleaseGate, validateHostname } from '../lib/deploy/release-policy';
import { createMobileCompatibilityPlan, validateMobileBuild } from '../lib/mobile/policy';
import { authorizeCreditUsage, reconcileProviderUsage } from '../lib/billing/ledger';
import { evaluateVoiceIntent, normalizeVoiceLanguage } from '../lib/voice/policy';
import { authorizeAgentTool, nextAgentVersion } from '../lib/agents/policy';
import { authorizeMcpTool, sanitizeMcpOutput } from '../lib/mcp/policy';
import { canProjectRole, optimisticCommentUpdate } from '../lib/collaboration/rbac';
import { validateDesignTokens, validateVisualSelection } from '../lib/visual/policy';
import { evaluateBetaCertification } from '../lib/hardening/certification';

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

test('AI routing respects capabilities, preference, budget and fallback', () => {
  const models = [
    { id: 'a', provider: 'one', model: 'text', capabilities: ['text'] as const, inputCostPerMillion: 1, outputCostPerMillion: 2, enabled: true, priority: 1 },
    { id: 'b', provider: 'two', model: 'vision', capabilities: ['text', 'vision'] as const, inputCostPerMillion: 2, outputCostPerMillion: 4, enabled: true, priority: 2 },
  ].map((model) => ({ ...model, capabilities: [...model.capabilities] }));
  const route = routeModel(models, { requiredCapabilities: ['text'], estimatedInputTokens: 1000, estimatedOutputTokens: 500, maxEstimatedCost: 1, preferredProvider: 'two' });
  assert.equal(route.selected.id, 'b');
  assert.deepEqual(route.fallbacks, ['a']);
  assert.equal(reconcileAICost(1, 1.01).withinTolerance, true);
});

test('integration policy redacts secrets and gates side effects', () => {
  assert.deepEqual(redactSecrets({ apiKey: 'secret', nested: { note: 'Bearer abcdefghijklmnop' } }), { apiKey: '[REDACTED]', nested: { note: '[REDACTED]' } });
  assert.equal(requiresApproval('payment', 'charge'), true);
  assert.equal(validateIdempotencyKey('project:task:action:1234'), 'project:task:action:1234');
});

test('source control policy refuses force, protected and secret pushes', () => {
  assert.equal(validatePushPlan({ branch: 'feat/ui', force: false, files: ['app/page.tsx'], protectedBranches: ['main'] }).force, false);
  assert.throws(() => validatePushPlan({ branch: 'main', force: false, files: ['app/page.tsx'], protectedBranches: ['main'] }), /protected_branch/);
  assert.throws(() => validatePushPlan({ branch: 'feat/x', force: false, files: ['.env'], protectedBranches: ['main'] }), /secret_files/);
  assert.equal(createPullRequestSummary({ title: 'Change', checks: [{ kind: 'unit', status: 'passed', artifactId: 'a' }], changedFiles: ['a.ts'] }).mergeReady, true);
});

test('production deploy is fail-closed and requires rollback target', () => {
  const gate = evaluateReleaseGate({ environment: 'production', artifactSha256: 'a'.repeat(64), qualityReleasable: true, smokePassed: true, approvalStatus: 'approved', previousProductionReleaseId: 'release-1' });
  assert.equal(gate.allowed, true);
  assert.equal(evaluateReleaseGate({ environment: 'production', artifactSha256: 'a'.repeat(64), qualityReleasable: true, smokePassed: true }).allowed, false);
  assert.equal(validateHostname('App.Example.com.'), 'app.example.com');
});

test('mobile policy rejects WebView substitutes and missing native modules', () => {
  assert.equal(createMobileCompatibilityPlan(['camera'], {}).compatible, false);
  assert.equal(validateMobileBuild({ platform: 'ios', artifactId: 'artifact', isWebView: false, scenariosPassed: ['C9'] }).releasable, true);
  assert.equal(validateMobileBuild({ platform: 'android', isWebView: true, scenariosPassed: [] }).releasable, false);
});

test('credit ledger enforces idempotency and hard caps', () => {
  const entries = [{ kind: 'grant' as const, credits: 10, idempotencyKey: 'grant:000000000001' }, { kind: 'usage' as const, credits: 3, idempotencyKey: 'usage:000000000001' }];
  assert.equal(authorizeCreditUsage(entries, 2, 5).allowed, true);
  assert.equal(authorizeCreditUsage(entries, 8, 10).allowed, false);
  assert.equal(reconcileProviderUsage(5, 5.005).reconciled, true);
});

test('voice and agent policies require confirmation and cannot bypass guardrails', () => {
  assert.equal(evaluateVoiceIntent({ intent: 'deploy_production', confidence: 0.99, transcriptConfirmed: false }).executable, false);
  assert.equal(normalizeVoiceLanguage('it-IT'), 'it');
  const guardrails = { allowedTools: ['read', 'deploy'], approvalRequiredTools: ['deploy'], maxCostPerRun: 2, maxSteps: 10 };
  assert.equal(authorizeAgentTool({ tool: 'deploy', approved: false, currentCost: 0, step: 1 }, guardrails).allowed, false);
  assert.equal(nextAgentVersion([1, 2]), 3);
});

test('MCP output cannot mutate policy and revoked clients lose access', () => {
  assert.equal(authorizeMcpTool({ permission: 'project.read', granted: ['project.read'], connectionStatus: 'revoked', callsInWindow: 0, rateLimit: 10 }).allowed, false);
  assert.deepEqual(sanitizeMcpOutput({ result: 'ok', policy: 'allow-all', budgetLimit: 999 }), { result: 'ok' });
});

test('collaboration, visual mapping and certification are fail-closed', () => {
  assert.equal(canProjectRole('reviewer', 'approve'), true);
  assert.throws(() => optimisticCommentUpdate({ expectedUpdatedAt: 1, currentUpdatedAt: 2 }), /concurrent_update/);
  assert.equal(validateVisualSelection({ selector: '#hero', sourcePath: 'app/page.tsx', sourceLine: 10, frozenPaths: [] }).patchable, true);
  assert.equal(validateDesignTokens({ 'color.primary': '#fff', 'space.2': 8 }).valid, true);
  assert.equal(evaluateBetaCertification([]).certified, false);
});
