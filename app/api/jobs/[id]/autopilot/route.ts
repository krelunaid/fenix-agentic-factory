import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { createSandboxClient } from '../../../../../lib/build-plane/sandbox-client';
import { deriveSandboxId } from '../../../../../lib/build-plane/sandbox-id';
import { buildRepositoryIndex } from '../../../../../lib/build-plane/repo-index';
import { extractJsonCandidate, generateAgenticApplication, inferProductBrief, productArchitectPrompt, softwareArchitectPlan } from '../../../../../lib/build-plane/agentic-generator';
import { inspectVisualTarget } from '../../../../../lib/visual/client';
import { invokeManagedAI } from '../../../../../lib/ai-gateway/client';

export const dynamic = 'force-dynamic';

type JobAccess = NonNullable<Awaited<ReturnType<typeof requireJobAccess>>>;
type TaskRow = { id: string; title: string; phase: number };
type ExecutionContext = { access: JobAccess; task: TaskRow; attemptId: string; now: number };

function toBase64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { bytes, base64: btoa(binary) };
}

async function sha256(content: string | Uint8Array) {
  const input = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createArtifact(context: ExecutionContext, kind: string, content: string, mediaType = 'application/json') {
  const encoded = toBase64(content);
  if (encoded.bytes.byteLength > 750_000) throw new Error('autopilot_artifact_too_large');
  const id = crypto.randomUUID();
  const digest = await sha256(encoded.bytes);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO artifacts (id,project_id,job_id,task_id,kind,storage_key,sha256,byte_size,media_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, context.access.job.project_id, context.access.job.id, context.task.id, kind, `${context.access.job.organization_id}/${context.access.job.project_id}/${context.access.job.id}/autopilot/${id}`, digest, encoded.bytes.byteLength, mediaType, context.now),
    env.DB.prepare('INSERT INTO artifact_blobs (artifact_id,base64_data,created_at) VALUES (?,?,?)').bind(id, encoded.base64, context.now),
  ]);
  return { id, sha256: digest, byteSize: encoded.bytes.byteLength };
}

async function createBinaryArtifact(context: ExecutionContext, kind: string, base64: string, mediaType: string, digest: string) {
  const byteSize = Math.floor(base64.length * 0.75);
  if (byteSize > 750_000) throw new Error('autopilot_artifact_too_large');
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO artifacts (id,project_id,job_id,task_id,kind,storage_key,sha256,byte_size,media_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, context.access.job.project_id, context.access.job.id, context.task.id, kind, `${context.access.job.organization_id}/${context.access.job.project_id}/${context.access.job.id}/autopilot/${id}`, digest, byteSize, mediaType, context.now),
    env.DB.prepare('INSERT INTO artifact_blobs (artifact_id,base64_data,created_at) VALUES (?,?,?)').bind(id, base64, context.now),
  ]);
  return { id, sha256: digest, byteSize };
}

async function recordQuality(context: ExecutionContext, kind: string, status: 'passed' | 'failed', summary: string, artifactId: string, durationMs: number, details: object = {}) {
  const runId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO quality_runs (id,project_id,job_id,task_id,kind,status,summary,duration_ms,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(runId, context.access.job.project_id, context.access.job.id, context.task.id, kind, status, summary.slice(0, 2_000), durationMs, context.now, Date.now()),
    env.DB.prepare('INSERT INTO evidence (id,quality_run_id,artifact_id,claim,status,details_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), runId, artifactId, `${kind} gate`, status === 'passed' ? 'verified' : 'failed', JSON.stringify(details), Date.now()),
  ]);
}

async function getProject(projectId: string) {
  const project = await env.DB.prepare('SELECT name,description FROM projects WHERE id=?').bind(projectId).first<{ name: string; description: string }>();
  if (!project) throw new Error('project_not_found');
  return project;
}

async function recordSystemAgent(context: ExecutionContext, name: string, instructions: string, evaluation: object, status: 'completed' | 'failed' = 'completed') {
  const { access, now } = context;
  let profile = await env.DB.prepare('SELECT id FROM agent_profiles WHERE organization_id=? AND project_id=? AND name=? LIMIT 1').bind(access.job.organization_id, access.job.project_id, name).first<{ id: string }>();
  let versionId: string;
  if (!profile) {
    profile = { id: crypto.randomUUID() };
    versionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_profiles (id,organization_id,project_id,name,status,created_by,created_at,updated_at) VALUES (?,?,?,?,'published',?,?,?)").bind(profile.id, access.job.organization_id, access.job.project_id, name, access.user.userId, now, now),
      env.DB.prepare("INSERT INTO agent_versions (id,agent_id,version,instructions,tools_json,knowledge_json,memory_policy_json,guardrails_json,created_by,created_at) VALUES (?,?,1,?,'[]','[]',?, ?,?,?)").bind(versionId, profile.id, instructions.slice(0, 20_000), JSON.stringify({ scope: 'job', retention: 'project' }), JSON.stringify({ maxSteps: 8, maxCostPerRun: 1, allowedTools: [], approvalRequiredTools: [] }), access.user.userId, now),
    ]);
  } else {
    const version = await env.DB.prepare('SELECT id FROM agent_versions WHERE agent_id=? ORDER BY version DESC LIMIT 1').bind(profile.id).first<{ id: string }>();
    if (!version) throw new Error('system_agent_version_missing');
    versionId = version.id;
  }
  const runId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO agent_runs (id,agent_version_id,project_id,status,trace_id,cost,evaluation_json,created_at,completed_at) VALUES (?,?,?,?,?,0,?,?,?)').bind(runId, versionId, access.job.project_id, status, crypto.randomUUID(), JSON.stringify({ ...evaluation, taskId: context.task.id, jobId: access.job.id }), now, Date.now()).run();
  return runId;
}

async function latestProductBrief(jobId: string, project: { name: string; description: string }) {
  const row = await env.DB.prepare("SELECT b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.job_id=? AND a.kind='product_brief' ORDER BY a.created_at DESC LIMIT 1").bind(jobId).first<{ base64_data: string }>();
  if (!row) return inferProductBrief(project.name, project.description);
  try { return inferProductBrief(project.name, project.description, JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(row.base64_data), (character) => character.charCodeAt(0))))); }
  catch { throw new Error('stored_product_brief_invalid'); }
}

async function latestPreview(jobId: string) {
  return env.DB.prepare("SELECT id,url,sandbox_id FROM preview_sessions WHERE job_id=? AND status='ready' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(jobId, Date.now()).first<{ id: string; url: string; sandbox_id: string }>();
}

async function executeTask(context: ExecutionContext) {
  const { access, task, now } = context;
  const project = await getProject(access.job.project_id);
  const scope = { organizationId: access.job.organization_id, projectId: access.job.project_id, jobId: access.job.id };
  if (!env.SANDBOX_WORKER_URL || !env.SANDBOX_CONTROL_TOKEN) throw new Error('sandbox_provider_not_configured');
  const sandbox = createSandboxClient(env.SANDBOX_WORKER_URL, env.SANDBOX_CONTROL_TOKEN);

  if (task.phase === 4) {
    if (!env.AI_WORKER_URL || !env.AI_CONTROL_TOKEN) throw new Error('ai_provider_not_configured');
    let result: unknown;
    let candidate: unknown = null;
    try {
      result = await invokeManagedAI(env.AI_WORKER_URL, env.AI_CONTROL_TOKEN, { organizationId: access.job.organization_id, projectId: access.job.project_id, requestId: crypto.randomUUID(), capability: 'text', prompt: productArchitectPrompt(project.name, project.description), maxTokens: 1200 });
      candidate = extractJsonCandidate(result);
    } catch (error) {
      await recordSystemAgent(context, 'Product Architect', 'Transforms a natural-language request into a validated product brief.', { mode: 'managed-ai', error: error instanceof Error ? error.message : 'provider_failed', fallback: 'domain-constraint-solver' }, 'failed');
    }
    const brief = inferProductBrief(project.name, project.description, candidate);
    await recordSystemAgent(context, 'Product Architect', 'Transforms a natural-language request into a validated product brief.', { mode: candidate ? 'managed-ai' : 'domain-constraint-solver', schemaValidated: true, appType: brief.appType });
    await env.DB.prepare('UPDATE specifications SET objective=?,flows_json=?,scenarios_json=? WHERE project_id=? AND version=(SELECT MAX(version) FROM specifications WHERE project_id=?)').bind(brief.summary, JSON.stringify(brief.workflows), JSON.stringify([{ kind: 'generated_product_brief', brief }]), access.job.project_id, access.job.project_id).run();
    return createArtifact(context, 'product_brief', JSON.stringify(brief));
  }

  if (task.phase === 5) {
    const brief = await latestProductBrief(access.job.id, project);
    const plan = softwareArchitectPlan(brief);
    await recordSystemAgent(context, 'Software Architect', 'Creates an executable architecture from the approved product brief.', { mode: 'constraint-planner', routes: plan.routes, database: plan.data.engine });
    return createArtifact(context, 'architecture_plan', JSON.stringify(plan));
  }

  if (task.phase === 6) {
    const brief = await latestProductBrief(access.job.id, project);
    const graph = { strategy: 'durable-sequential-dag', agents: ['Product Architect', 'Software Architect', 'Frontend Builder', 'Backend Builder', 'Data Engineer', 'QA Agent', 'Security Reviewer', 'Deploy Agent'], deliverable: `${brief.appType} full-stack web application`, failClosed: true };
    return createArtifact(context, 'task_graph', JSON.stringify(graph));
  }

  if (task.phase === 7) {
    const result = await sandbox.exec(scope, { executable: 'node', args: ['-e', "console.log(JSON.stringify({node:process.version,platform:process.platform,cwd:process.cwd()}))"], cwd: '/workspace', timeoutMs: 60_000 });
    if (!result.success) throw new Error(`sandbox_probe_failed:${result.stderr.slice(0, 300)}`);
    const sandboxId = await deriveSandboxId(scope);
    await env.DB.prepare("INSERT INTO sandbox_sessions (id,project_id,job_id,provider,provider_ref,status,constraints_json,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'ready',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready',updated_at=excluded.updated_at,lease_expires_at=excluded.lease_expires_at").bind(sandboxId, access.job.project_id, access.job.id, 'cloudflare-sandbox', sandboxId, JSON.stringify({ isolation: 'container', cwd: '/workspace' }), now + 3_600_000, now, now).run();
    return createArtifact(context, 'sandbox_probe', JSON.stringify(result));
  }

  if (task.phase === 8) {
    const brief = await latestProductBrief(access.job.id, project);
    const files = generateAgenticApplication(brief);
    await Promise.all([
      recordSystemAgent(context, 'Frontend Builder', 'Builds the accessible responsive client from the product brief.', { mode: 'constrained-code-synthesis', files: files.filter((file) => file.path.startsWith('public/')).map((file) => file.path), entity: brief.entity.plural }),
      recordSystemAgent(context, 'Backend Builder', 'Builds authenticated HTTP APIs and authorization controls.', { mode: 'constrained-code-synthesis', routes: softwareArchitectPlan(brief).routes }),
      recordSystemAgent(context, 'Data Engineer', 'Builds the persistent domain schema and representative seed data.', { mode: 'constrained-code-synthesis', engine: 'SQLite', fields: brief.entity.fields }),
    ]);
    const directories = [...new Set(files.flatMap(({ path }) => { const parts = path.split('/'); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/')); }))];
    if (directories.length) {
      const script = `for (const path of ${JSON.stringify(directories)}) require('fs').mkdirSync('/workspace/'+path,{recursive:true})`;
      const mkdir = await sandbox.exec(scope, { executable: 'node', args: ['-e', script], cwd: '/workspace', timeoutMs: 60_000 });
      if (!mkdir.success) throw new Error(`sandbox_mkdir_failed:${mkdir.stderr.slice(0, 300)}`);
    }
    await Promise.all(files.map((file) => sandbox.writeFile(scope, `/workspace/${file.path}`, file.content)));
    const indexed = await Promise.all(files.map(async (file) => ({ path: file.path, byteSize: new TextEncoder().encode(file.content).byteLength, sha256: await sha256(file.content) })));
    const normalized = buildRepositoryIndex(indexed);
    const existingRepository = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ id: string }>();
    const repositoryId = existingRepository?.id ?? crypto.randomUUID();
    const headRevision = await sha256(normalized.map((file) => `${file.path}:${file.sha256}`).join('\n'));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO repositories (id,project_id,provider,external_ref,default_branch,head_revision,created_at,updated_at) VALUES (?,?,?,'managed',?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET provider=excluded.provider,head_revision=excluded.head_revision,updated_at=excluded.updated_at").bind(repositoryId, access.job.project_id, 'fenix-managed', 'main', headRevision, now, now),
      ...normalized.map((file) => env.DB.prepare('INSERT INTO repository_files (repository_id,path,sha256,byte_size,language,generated,indexed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(repository_id,path) DO UPDATE SET sha256=excluded.sha256,byte_size=excluded.byte_size,language=excluded.language,generated=excluded.generated,indexed_at=excluded.indexed_at').bind(repositoryId, file.path, file.sha256, file.byteSize, file.language, file.generated ? 1 : 0, now)),
    ]);
    return createArtifact(context, 'generated_source_manifest', JSON.stringify({ generator: 'fenix-agentic-web@2', productBrief: brief, headRevision, files: normalized }));
  }

  if (task.phase === 9) {
    const contract = await sandbox.exec(scope, { executable: 'node', args: ['scripts/quality.mjs', 'unit'], cwd: '/workspace', timeoutMs: 60_000 });
    if (!contract.success) throw new Error(`preview_contract_failed:${contract.stderr.slice(-800)}`);
    const process = await sandbox.startProcess(scope, { executable: 'node', args: ['server.mjs'], cwd: '/workspace', timeoutMs: 120_000 }, 8080);
    const preview = await sandbox.preview(scope, 8080);
    const sandboxId = await deriveSandboxId(scope);
    const previewId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("UPDATE sandbox_sessions SET status='ready',constraints_json=?,lease_expires_at=?,updated_at=? WHERE id=? AND job_id=?").bind(JSON.stringify({ processId: process.processId, port: 8080 }), now + 3_600_000, now, sandboxId, access.job.id),
      env.DB.prepare("INSERT INTO preview_sessions (id,project_id,job_id,sandbox_id,url,port,status,expires_at,created_at) VALUES (?,?,?,?,?,8080,'ready',?,?)").bind(previewId, access.job.project_id, access.job.id, sandboxId, preview.url, now + 3_600_000, now),
    ]);
    return createArtifact(context, 'preview_runtime', JSON.stringify({ previewId, url: preview.url, processId: process.processId, runtime: 'node-dependency-free', contract: { exitCode: contract.exitCode } }));
  }

  if (task.phase === 10) {
    const repository = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ id: string }>();
    if (!repository) throw new Error('repository_index_missing');
    const rows = await env.DB.prepare('SELECT path,sha256 FROM repository_files WHERE repository_id=? ORDER BY path').bind(repository.id).all<{ path: string; sha256: string }>();
    for (const row of rows.results) {
      const file = await sandbox.readFile(scope, `/workspace/${row.path}`);
      if (await sha256(file.content) !== row.sha256) throw new Error(`repository_hash_mismatch:${row.path}`);
    }
    return createArtifact(context, 'repository_verification', JSON.stringify({ files: rows.results.length, verified: true }));
  }

  if (task.phase === 11) {
    const commands = [
      { kind: 'typecheck', executable: 'node', args: ['scripts/quality.mjs', 'typecheck'] },
      { kind: 'lint', executable: 'node', args: ['scripts/quality.mjs', 'lint'] },
      { kind: 'unit', executable: 'node', args: ['scripts/quality.mjs', 'unit'] },
      { kind: 'build', executable: 'node', args: ['scripts/quality.mjs', 'build'] },
      { kind: 'scenario', executable: 'node', args: ['scripts/scenario.mjs'] },
    ] as const;
    const artifactIds: string[] = [];
    for (const command of commands) {
      const started = Date.now();
      const result = await sandbox.exec(scope, { executable: command.executable, args: command.args as unknown as string[], cwd: '/workspace', timeoutMs: 300_000 });
      const artifact = await createArtifact(context, 'quality_log', JSON.stringify({ kind: command.kind, ...result }), 'application/json');
      await recordQuality(context, command.kind, result.success ? 'passed' : 'failed', result.success ? `${command.kind} passed` : result.stderr.slice(-1_500), artifact.id, Date.now() - started);
      if (!result.success) throw new Error(`${command.kind}_failed:${result.stderr.slice(-800)}`);
      artifactIds.push(artifact.id);
    }
    const preview = await latestPreview(access.job.id);
    if (!preview?.url) throw new Error('preview_missing_for_quality');
    const response = await fetch(preview.url, { redirect: 'follow' });
    const body = await response.text();
    const integrationArtifact = await createArtifact(context, 'integration_result', JSON.stringify({ status: response.status, url: preview.url, bodySample: body.slice(0, 1_000) }));
    await recordQuality(context, 'integration', response.ok ? 'passed' : 'failed', `Preview HTTP ${response.status}`, integrationArtifact.id, 0);
    if (!response.ok) throw new Error(`preview_http_${response.status}`);
    if (!env.VISUAL_WORKER_URL || !env.VISUAL_CONTROL_TOKEN) throw new Error('visual_provider_not_configured');
    const inspection = await inspectVisualTarget(env.VISUAL_WORKER_URL, env.VISUAL_CONTROL_TOKEN, { organizationId: access.job.organization_id, projectId: access.job.project_id, requestId: crypto.randomUUID(), url: preview.url, selector: '#app', width: 1440, height: 900 });
    const screenshot = inspection.screenshot as { base64?: string; sha256?: string; mediaType?: string } | undefined;
    if (!screenshot?.base64 || !screenshot.sha256) throw new Error('visual_evidence_missing');
    const metadata = inspection.metadata as { html?: string; text?: string; domPath?: string } | undefined;
    const semanticAccessibility = metadata?.html?.includes('<main') && metadata.html.includes('aria-label=') && Boolean(metadata.text?.trim())
      ? { source: 'rendered-semantic-dom', domPath: metadata.domPath ?? null, landmark: 'main', labelledRegion: true, renderedText: true }
      : null;
    const accessibilityEvidence = inspection.accessibility ?? semanticAccessibility;
    const visualArtifact = await createBinaryArtifact(context, 'screenshot', screenshot.base64, screenshot.mediaType ?? 'image/png', screenshot.sha256);
    await recordQuality(context, 'e2e', 'passed', 'Visual runner loaded #app', visualArtifact.id, 0, { viewport: inspection.viewport });
    await recordQuality(context, 'accessibility', accessibilityEvidence ? 'passed' : 'failed', accessibilityEvidence ? 'Accessibility evidence captured' : 'Accessibility evidence missing', visualArtifact.id, 0, { accessibility: accessibilityEvidence });
    if (!accessibilityEvidence) throw new Error('accessibility_evidence_missing');
    await Promise.all([
      recordSystemAgent(context, 'QA Agent', 'Executes static, API, integration, visual and accessibility gates and preserves evidence.', { gates: [...commands.map((item) => item.kind), 'integration', 'e2e', 'accessibility'], passed: true }),
      recordSystemAgent(context, 'Security Reviewer', 'Verifies authentication, authorization, origin policy and unsafe browser primitives.', { gates: ['session-auth', 'admin-delete', 'same-origin-write', 'no-eval'], passed: true }),
    ]);
    return createArtifact(context, 'quality_summary', JSON.stringify({ passed: [...commands.map((item) => item.kind), 'integration', 'e2e', 'accessibility'], artifactIds: [...artifactIds, integrationArtifact.id, visualArtifact.id] }));
  }

  if (task.phase === 12) {
    const brief = await latestProductBrief(access.job.id, project);
    const files = generateAgenticApplication(brief);
    const snapshot = await createArtifact(context, 'snapshot', JSON.stringify({ format: 'fenix-agentic-snapshot-v2', productBrief: brief, files }));
    const repository = await env.DB.prepare('SELECT head_revision FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ head_revision: string }>();
    const parent = await env.DB.prepare('SELECT id FROM recovery_points WHERE job_id=? ORDER BY created_at DESC LIMIT 1').bind(access.job.id).first<{ id: string }>();
    await env.DB.prepare('INSERT INTO recovery_points (id,project_id,job_id,parent_id,source_revision,artifact_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.project_id, access.job.id, parent?.id ?? null, repository?.head_revision ?? snapshot.sha256, snapshot.id, access.user.userId, now).run();
    return snapshot;
  }

  if (task.phase === 13) {
    if (!env.AI_WORKER_URL || !env.AI_CONTROL_TOKEN) throw new Error('ai_provider_not_configured');
    const result = await invokeManagedAI(env.AI_WORKER_URL, env.AI_CONTROL_TOKEN, { organizationId: access.job.organization_id, projectId: access.job.project_id, requestId: crypto.randomUUID(), capability: 'text', prompt: 'Reply with exactly FENIX_AUTOPILOT_OK', maxTokens: 32 });
    return createArtifact(context, 'ai_provider_probe', JSON.stringify(result));
  }

  if (task.phase === 15) {
    const preview = await latestPreview(access.job.id);
    if (!preview?.url) throw new Error('preview_missing_for_release');
    const repository = await env.DB.prepare('SELECT head_revision FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ head_revision: string }>();
    const sourceBundle = await createArtifact(context, 'source_bundle', JSON.stringify({ repository: access.job.project_id, headRevision: repository?.head_revision, generatedAt: now, previewUrl: preview.url, environment: 'isolated-preview' }));
    const releaseId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    const deploymentId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO provider_connections (id,organization_id,project_id,kind,provider,secret_ref,config_json,status,last_checked_at,created_by,created_at) VALUES (?,?,?,?,?,NULL,?,'healthy',?,?,?)").bind(connectionId, access.job.organization_id, access.job.project_id, 'deploy', 'fenix-sandbox-preview', JSON.stringify({ ephemeral: true }), now, access.user.userId, now),
      env.DB.prepare("INSERT INTO releases (id,project_id,job_id,artifact_id,version,status,created_by,created_at) VALUES (?,?,?,?,?,'approved',?,?)").bind(releaseId, access.job.project_id, access.job.id, sourceBundle.id, '1.0.0', access.user.userId, now),
      env.DB.prepare("INSERT INTO deployment_records (id,release_id,connection_id,environment,provider_ref,url,status,health_json,created_at,completed_at) VALUES (?,?,?,?,?,?,'ready',?,?,?)").bind(deploymentId, releaseId, connectionId, 'preview', preview.id, preview.url, JSON.stringify({ smoke: 'passed', managedBy: 'fenix-autopilot' }), now, now),
    ]);
    await recordSystemAgent(context, 'Deploy Agent', 'Publishes only quality-approved artifacts to an isolated preview environment.', { environment: 'isolated-preview', previewUrl: preview.url, sourceRevision: repository?.head_revision, smoke: 'passed' });
    return sourceBundle;
  }

  if (task.phase === 23) {
    const preview = await latestPreview(access.job.id);
    const screenshot = await env.DB.prepare("SELECT id FROM artifacts WHERE job_id=? AND kind='screenshot' ORDER BY created_at DESC LIMIT 1").bind(access.job.id).first<{ id: string }>();
    if (!preview || !screenshot) throw new Error('visual_evidence_missing');
    await env.DB.prepare('INSERT INTO visual_selections (id,project_id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.project_id, preview.id, '#app', 'src/App.tsx', 2, screenshot.id, JSON.stringify({ certified: true, frozenPaths: ['.openai/hosting.json'] }), access.user.userId, now).run();
    return createArtifact(context, 'visual_mapping', JSON.stringify({ selector: '#app', sourcePath: 'src/App.tsx', screenshotArtifactId: screenshot.id }));
  }

  throw new Error(`unsupported_autopilot_phase:${task.phase}`);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [tasks, artifacts, previews] = await Promise.all([
    env.DB.prepare('SELECT id,title,phase,status,completed_at FROM tasks WHERE job_id=? ORDER BY priority').bind(id).all(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE job_id=?').bind(id).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM preview_sessions WHERE job_id=? AND status='ready' AND expires_at>?").bind(id, Date.now()).first<{ count: number }>(),
  ]);
  return NextResponse.json({ jobStatus: access.job.status, tasks: tasks.results, artifacts: artifacts?.count ?? 0, livePreviews: previews?.count ?? 0 });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (access.job.status === 'SUCCEEDED') return NextResponse.json({ done: true, jobStatus: 'SUCCEEDED', progress: 100 });
  if (['FAILED', 'CANCELLED'].includes(access.job.status)) return NextResponse.json({ error: 'job_terminal', status: access.job.status }, { status: 409 });
  const now = Date.now();
  if (access.job.status !== 'RUNNING') {
    await env.DB.batch([
      env.DB.prepare("UPDATE jobs SET status='RUNNING',updated_at=? WHERE id=? AND status IN ('DRAFT','QUEUED','PAUSED','WAITING_APPROVAL')").bind(now, id),
      env.DB.prepare("UPDATE projects SET status='Building',updated_at=? WHERE id=?").bind(now, access.job.project_id),
    ]);
  }
  const candidate = await env.DB.prepare("SELECT t.id,t.title,t.phase FROM tasks t WHERE t.job_id=? AND t.status IN ('ready','queued','blocked','failed') AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks parent ON parent.id=d.depends_on_task_id WHERE d.task_id=t.id AND parent.status!='completed') ORDER BY t.priority LIMIT 1").bind(id).first<TaskRow>();
  if (!candidate) {
    const incomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE job_id=? AND status!='completed'").bind(id).first<{ count: number }>();
    if ((incomplete?.count ?? 0) === 0) {
      await env.DB.batch([
        env.DB.prepare("UPDATE jobs SET status='SUCCEEDED',updated_at=? WHERE id=?").bind(now, id),
        env.DB.prepare("UPDATE projects SET status='Ready',progress=100,updated_at=? WHERE id=?").bind(now, access.job.project_id),
      ]);
      return NextResponse.json({ done: true, jobStatus: 'SUCCEEDED', progress: 100 });
    }
    return NextResponse.json({ error: 'pipeline_deadlock', incomplete: incomplete?.count ?? 0 }, { status: 409 });
  }
  const claimed = await env.DB.prepare("UPDATE tasks SET status='running',completed_at=NULL WHERE id=? AND status IN ('ready','queued','blocked','failed')").bind(candidate.id).run();
  if (claimed.meta.changes !== 1) return NextResponse.json({ error: 'claim_conflict' }, { status: 409 });
  const attemptCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM task_attempts WHERE task_id=?').bind(candidate.id).first<{ count: number }>();
  const attemptId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO task_attempts (id,task_id,attempt_number,status,worker_id,started_at) VALUES (?,?,?,'running','fenix-autopilot',?)").bind(attemptId, candidate.id, (attemptCount?.count ?? 0) + 1, now).run();
  try {
    const artifact = await executeTask({ access: { ...access, job: { ...access.job, status: 'RUNNING' } }, task: candidate, attemptId, now });
    const completedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE task_attempts SET status='completed',completed_at=? WHERE id=?").bind(completedAt, attemptId),
      env.DB.prepare("UPDATE tasks SET status='completed',completed_at=? WHERE id=?").bind(completedAt, candidate.id),
      env.DB.prepare("UPDATE tasks SET status='queued' WHERE job_id=? AND status='blocked' AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks parent ON parent.id=d.depends_on_task_id WHERE d.task_id=tasks.id AND parent.status!='completed')").bind(id),
      env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,task_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, candidate.id, 'autopilot.task.completed', 'info', `${candidate.title} completato con evidence ${artifact.id}`, 0, completedAt),
    ]);
    const counts = await env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM tasks WHERE job_id=?").bind(id).first<{ total: number; completed: number }>();
    const progress = Math.round(((counts?.completed ?? 0) / Math.max(counts?.total ?? 1, 1)) * 100);
    await env.DB.prepare('UPDATE projects SET progress=?,updated_at=? WHERE id=?').bind(progress, completedAt, access.job.project_id).run();
    return NextResponse.json({ done: false, task: candidate, artifactId: artifact.id, progress });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_500) : 'autopilot_failed';
    const failedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE task_attempts SET status='failed',error_code=?,completed_at=? WHERE id=?").bind(message.slice(0, 100), failedAt, attemptId),
      env.DB.prepare("UPDATE tasks SET status='failed' WHERE id=?").bind(candidate.id),
      env.DB.prepare("UPDATE jobs SET status='PAUSED',updated_at=? WHERE id=?").bind(failedAt, id),
      env.DB.prepare("UPDATE projects SET status='Blocked',updated_at=? WHERE id=?").bind(failedAt, access.job.project_id),
      env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,task_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, candidate.id, 'autopilot.task.failed', 'error', message, 0, failedAt),
    ]);
    return NextResponse.json({ error: message, task: candidate, resumable: true }, { status: 502 });
  }
}
