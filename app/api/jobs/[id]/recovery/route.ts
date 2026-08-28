import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { selectRollbackPath, type RecoveryPoint } from '../../../../../lib/build-plane/recovery';

export const dynamic = 'force-dynamic';

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
  const input = await request.json().catch(() => null) as { action?: unknown; artifactId?: unknown; sourceRevision?: unknown; parentId?: unknown; fromId?: unknown; targetId?: unknown } | null;
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
