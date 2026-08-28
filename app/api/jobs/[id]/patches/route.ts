import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { validatePatch, verifyPatchPreconditions, type PatchOperation } from '../../../../../lib/build-plane/patch-policy';
import { buildRepositoryIndex } from '../../../../../lib/build-plane/repo-index';
import { createSandboxClient } from '../../../../../lib/build-plane/sandbox-client';

export const dynamic = 'force-dynamic';

type InputOperation = PatchOperation & { content?: unknown };
const frozenPaths = ['.git', '.env', '.dev.vars', '.openai/hosting.json', 'node_modules', 'dist'];

async function sha256(content: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare("SELECT id,actor_user_id,payload_json,created_at FROM audit_events WHERE organization_id=? AND resource_type='job' AND resource_id=? AND action='patch.apply' ORDER BY created_at DESC LIMIT 100").bind(access.job.organization_id, id).all();
  return NextResponse.json({ patches: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!env.SANDBOX_WORKER_URL || !env.SANDBOX_CONTROL_TOKEN) return NextResponse.json({ error: 'sandbox_provider_not_configured' }, { status: 503 });
  const input = await request.json().catch(() => null) as { operations?: unknown; approvalId?: unknown } | null;
  if (!Array.isArray(input?.operations) || input.operations.length === 0 || input.operations.length > 32) return NextResponse.json({ error: 'invalid_patch' }, { status: 400 });

  const raw = input.operations as InputOperation[];
  const candidates: PatchOperation[] = [];
  const rawContents: Array<string | undefined> = [];
  let totalBytes = 0;
  try {
    for (const item of raw) {
      if (!item || typeof item.path !== 'string' || !['create', 'update', 'delete'].includes(item.operation)) throw new Error('invalid_operation');
      let content: string | undefined;
      if (item.operation !== 'delete') {
        if (typeof item.content !== 'string') throw new Error(`missing_content:${item.path}`);
        content = item.content;
        totalBytes += new TextEncoder().encode(content).byteLength;
        if (totalBytes > 2_000_000) throw new Error('patch_payload_too_large');
      }
      const contentSha256 = content === undefined ? undefined : await sha256(content);
      if (item.contentSha256 && item.contentSha256 !== contentSha256) throw new Error(`content_hash_mismatch:${item.path}`);
      candidates.push({ path: item.path, operation: item.operation, expectedSha256: item.expectedSha256, contentSha256 });
      rawContents.push(content);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_patch' }, { status: 400 });
  }

  const hasDelete = candidates.some((operation) => operation.operation === 'delete');
  if (hasDelete) {
    if (typeof input.approvalId !== 'string') return NextResponse.json({ error: 'delete_requires_approval' }, { status: 409 });
    const approval = await env.DB.prepare("SELECT id FROM approvals WHERE id=? AND job_id=? AND kind='destructive_data' AND status='approved'").bind(input.approvalId, id).first();
    if (!approval) return NextResponse.json({ error: 'approved_destructive_gate_required' }, { status: 409 });
  }

  let operations: PatchOperation[];
  try {
    operations = validatePatch(candidates, { allowedGlobs: ['**'], frozenPaths, maxFiles: 32, allowDelete: hasDelete, allowGenerated: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'patch_policy_failed' }, { status: 400 });
  }
  const contents = new Map(operations.map((operation, index) => [operation.path, rawContents[index]]));
  const repository = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ id: string }>();
  if (!repository) return NextResponse.json({ error: 'repository_index_required' }, { status: 409 });
  const rows = await env.DB.prepare('SELECT path,sha256 FROM repository_files WHERE repository_id=?').bind(repository.id).all();
  const index = new Map((rows.results as Array<{ path: string; sha256: string }>).map((row) => [row.path, row.sha256]));
  try {
    verifyPatchPreconditions(operations, index);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'patch_precondition_failed' }, { status: 409 });
  }

  const scope = { organizationId: access.job.organization_id, projectId: access.job.project_id, jobId: id };
  const client = createSandboxClient(env.SANDBOX_WORKER_URL, env.SANDBOX_CONTROL_TOKEN);
  const originals = new Map<string, string>();
  const applied: PatchOperation[] = [];
  async function rollbackApplied() {
    const failures: string[] = [];
    for (const operation of [...applied].reverse()) {
      const path = `/workspace/${operation.path}`;
      try {
        if (operation.operation === 'create') await client.deleteFile(scope, path);
        else await client.writeFile(scope, path, originals.get(operation.path) ?? '');
      } catch { failures.push(operation.path); }
    }
    return failures;
  }
  try {
    for (const operation of operations) {
      const workspacePath = `/workspace/${operation.path}`;
      if (operation.operation !== 'create') {
        const current = await client.readFile(scope, workspacePath);
        if (await sha256(current.content) !== operation.expectedSha256) throw new Error(`sandbox_precondition_failed:${operation.path}`);
        originals.set(operation.path, current.content);
      }
      if (operation.operation === 'delete') await client.deleteFile(scope, workspacePath);
      else await client.writeFile(scope, workspacePath, contents.get(operation.path) ?? '');
      applied.push(operation);
    }
  } catch (error) {
    const rollbackFailures = await rollbackApplied();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'patch_apply_failed', rollbackComplete: rollbackFailures.length === 0, rollbackFailures }, { status: 409 });
  }

  const now = Date.now();
  const patchId = crypto.randomUUID();
  const statements = operations.map((operation) => {
    if (operation.operation === 'delete') return env.DB.prepare('DELETE FROM repository_files WHERE repository_id=? AND path=?').bind(repository.id, operation.path);
    const content = contents.get(operation.path) ?? '';
    const indexed = buildRepositoryIndex([{ path: operation.path, byteSize: new TextEncoder().encode(content).byteLength, sha256: operation.contentSha256 ?? '' }])[0];
    return env.DB.prepare('INSERT INTO repository_files (repository_id,path,sha256,byte_size,language,generated,indexed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(repository_id,path) DO UPDATE SET sha256=excluded.sha256,byte_size=excluded.byte_size,language=excluded.language,generated=excluded.generated,indexed_at=excluded.indexed_at').bind(repository.id, indexed.path, indexed.sha256, indexed.byteSize, indexed.language, indexed.generated ? 1 : 0, now);
  });
  statements.push(env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(patchId, access.job.organization_id, access.user.userId, 'patch.apply', 'job', id, JSON.stringify({ operations, approvalId: typeof input.approvalId === 'string' ? input.approvalId : null }), now));
  try {
    await env.DB.batch(statements);
  } catch {
    const rollbackFailures = await rollbackApplied();
    return NextResponse.json({ error: 'patch_persistence_failed', rollbackComplete: rollbackFailures.length === 0, rollbackFailures }, { status: 500 });
  }
  return NextResponse.json({ id: patchId, status: 'applied', operations, appliedAt: now }, { status: 201 });
}
