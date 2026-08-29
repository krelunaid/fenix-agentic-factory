import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { selectRollbackPath, type RecoveryPoint } from '../../../../../lib/build-plane/recovery';
import { createSandboxClient } from '../../../../../lib/build-plane/sandbox-client';
import { buildRepositoryIndex, normalizeRepositoryPath } from '../../../../../lib/build-plane/repo-index';

export const dynamic = 'force-dynamic';

async function sha256(content: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const points = await env.DB.prepare('SELECT id,parent_id,source_revision,artifact_id,created_by,created_at FROM recovery_points WHERE job_id=? ORDER BY created_at DESC').bind(id).all();
  return NextResponse.json({ recoveryPoints: points.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; artifactId?: unknown; sourceRevision?: unknown; parentId?: unknown; fromId?: unknown; targetId?: unknown; recoveryPointId?: unknown; approvalId?: unknown } | null;
  if (input?.action === 'apply-rollback' && typeof input.recoveryPointId === 'string') {
    if (!env.SANDBOX_WORKER_URL || !env.SANDBOX_CONTROL_TOKEN) return NextResponse.json({ error: 'sandbox_provider_not_configured' }, { status: 503 });
    const point = await env.DB.prepare("SELECT rp.id,rp.artifact_id,ab.base64_data FROM recovery_points rp JOIN artifacts a ON a.id=rp.artifact_id JOIN artifact_blobs ab ON ab.artifact_id=a.id WHERE rp.id=? AND rp.job_id=? AND a.kind='snapshot'").bind(input.recoveryPointId, id).first<{ id: string; artifact_id: string; base64_data: string }>();
    if (!point) return NextResponse.json({ error: 'recovery_snapshot_not_found' }, { status: 404 });
    let snapshot: { format?: string; files?: Array<{ path?: unknown; existed?: unknown; content?: unknown }> };
    try { snapshot = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(point.base64_data), (character) => character.charCodeAt(0)))) as typeof snapshot; }
    catch { return NextResponse.json({ error: 'invalid_recovery_snapshot' }, { status: 409 }); }
    if (snapshot.format !== 'fenix-patch-snapshot-v1' || !Array.isArray(snapshot.files) || snapshot.files.length === 0 || snapshot.files.length > 32) return NextResponse.json({ error: 'unsupported_recovery_snapshot' }, { status: 409 });
    const files = snapshot.files.map((file) => ({ path: normalizeRepositoryPath(String(file.path ?? '')), existed: file.existed === true, content: typeof file.content === 'string' ? file.content : '' }));
    if (files.some((file) => ['.git', '.env', '.dev.vars', '.openai/hosting.json'].some((path) => file.path === path || file.path.startsWith(`${path}/`)))) return NextResponse.json({ error: 'protected_recovery_path' }, { status: 409 });
    if (files.some((file) => !file.existed)) {
      if (typeof input.approvalId !== 'string') return NextResponse.json({ error: 'rollback_delete_requires_approval' }, { status: 409 });
      const approval = await env.DB.prepare("SELECT id FROM approvals WHERE id=? AND job_id=? AND kind='destructive_data' AND status='approved'").bind(input.approvalId, id).first();
      if (!approval) return NextResponse.json({ error: 'approved_destructive_gate_required' }, { status: 409 });
    }
    const repository = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(access.job.project_id).first<{ id: string }>();
    if (!repository) return NextResponse.json({ error: 'repository_index_required' }, { status: 409 });
    const scope = { organizationId: access.job.organization_id, projectId: access.job.project_id, jobId: id };
    const client = createSandboxClient(env.SANDBOX_WORKER_URL, env.SANDBOX_CONTROL_TOKEN);
    try {
      for (const file of files) {
        if (file.existed) await client.writeFile(scope, `/workspace/${file.path}`, file.content);
        else await client.deleteFile(scope, `/workspace/${file.path}`);
      }
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'rollback_provider_failed' }, { status: 502 }); }
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    for (const file of files) {
      if (!file.existed) statements.push(env.DB.prepare('DELETE FROM repository_files WHERE repository_id=? AND path=?').bind(repository.id, file.path));
      else {
        const hash = await sha256(file.content);
        const indexed = buildRepositoryIndex([{ path: file.path, byteSize: new TextEncoder().encode(file.content).byteLength, sha256: hash }])[0];
        statements.push(env.DB.prepare('INSERT INTO repository_files (repository_id,path,sha256,byte_size,language,generated,indexed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(repository_id,path) DO UPDATE SET sha256=excluded.sha256,byte_size=excluded.byte_size,language=excluded.language,generated=excluded.generated,indexed_at=excluded.indexed_at').bind(repository.id, indexed.path, indexed.sha256, indexed.byteSize, indexed.language, indexed.generated ? 1 : 0, now));
      }
    }
    statements.push(
      env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.organization_id, access.user.userId, 'recovery.apply', 'recovery_point', point.id, JSON.stringify({ artifactId: point.artifact_id, files: files.map((file) => file.path) }), now),
      env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, 'recovery.applied', 'warning', `Rollback applicato a ${files.length} file`, 0, now),
    );
    await env.DB.batch(statements);
    return NextResponse.json({ id: point.id, status: 'rolled_back', files: files.map((file) => file.path), appliedAt: now });
  }
  if (input?.action === 'create' && typeof input.artifactId === 'string' && typeof input.sourceRevision === 'string') {
    const artifact = await env.DB.prepare("SELECT id FROM artifacts WHERE id=? AND job_id=? AND kind IN ('snapshot','source_bundle')").bind(input.artifactId, id).first();
    if (!artifact) return NextResponse.json({ error: 'snapshot_artifact_required' }, { status: 400 });
    if (typeof input.parentId === 'string') {
      const parent = await env.DB.prepare('SELECT id FROM recovery_points WHERE id=? AND job_id=?').bind(input.parentId, id).first();
      if (!parent) return NextResponse.json({ error: 'parent_scope_mismatch' }, { status: 400 });
    }
    const recoveryId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO recovery_points (id,project_id,job_id,parent_id,source_revision,artifact_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(recoveryId, access.job.project_id, id, typeof input.parentId === 'string' ? input.parentId : null, input.sourceRevision.slice(0, 200), input.artifactId, access.user.userId, now).run();
    return NextResponse.json({ id: recoveryId, createdAt: now }, { status: 201 });
  }
  if (input?.action === 'plan-rollback' && typeof input.fromId === 'string' && typeof input.targetId === 'string') {
    const rows = await env.DB.prepare('SELECT id,project_id,job_id,parent_id,source_revision,artifact_id,created_at FROM recovery_points WHERE job_id=?').bind(id).all();
    try {
      const path = selectRollbackPath((rows.results as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), projectId: String(row.project_id), jobId: String(row.job_id), parentId: row.parent_id ? String(row.parent_id) : null, sourceRevision: String(row.source_revision), artifactId: String(row.artifact_id), createdAt: Number(row.created_at) } satisfies RecoveryPoint)), input.fromId, input.targetId);
      return NextResponse.json({ requiresApproval: true, destructive: true, path: path.map((point) => ({ id: point.id, sourceRevision: point.sourceRevision, artifactId: point.artifactId })) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_rollback' }, { status: 400 });
    }
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
