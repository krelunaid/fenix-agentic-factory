import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { validatePushPlan } from '../../../../../lib/source-control/policy';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT s.id,s.direction,s.branch,s.base_revision,s.head_revision,s.status,s.conflict_json,s.created_at,s.completed_at FROM repository_syncs s JOIN repositories r ON r.id=s.repository_id WHERE r.project_id=? ORDER BY s.created_at DESC').bind(id).all();
  return NextResponse.json({ syncs: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { connectionId?: unknown; direction?: unknown; branch?: unknown; force?: unknown; files?: unknown; protectedBranches?: unknown; baseRevision?: unknown } | null;
  if (!input || typeof input.connectionId !== 'string' || !['import', 'push', 'pull'].includes(String(input.direction))) return NextResponse.json({ error: 'invalid_sync_request' }, { status: 400 });
  const connection = await env.DB.prepare("SELECT id FROM source_connections WHERE id=? AND organization_id=? AND status='active'").bind(input.connectionId, access.organizationId).first();
  if (!connection) return NextResponse.json({ error: 'source_connection_not_active' }, { status: 503 });
  const repository = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(id).first<{ id: string }>();
  if (!repository) return NextResponse.json({ error: 'repository_not_indexed' }, { status: 409 });
  let plan;
  try {
    plan = validatePushPlan({ branch: typeof input.branch === 'string' ? input.branch : 'fenix/change', force: input.force === true, files: Array.isArray(input.files) ? input.files.filter((value): value is string => typeof value === 'string') : [], protectedBranches: Array.isArray(input.protectedBranches) ? input.protectedBranches.filter((value): value is string => typeof value === 'string') : ['main'] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_push_plan' }, { status: 400 });
  }
  const syncId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO repository_syncs (id,repository_id,connection_id,direction,branch,base_revision,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)").bind(syncId, repository.id, input.connectionId, input.direction, plan.branch, typeof input.baseRevision === 'string' ? input.baseRevision : null, now).run();
  return NextResponse.json({ id: syncId, status: 'pending', plan, execution: 'provider_worker_required' }, { status: 202 });
}
