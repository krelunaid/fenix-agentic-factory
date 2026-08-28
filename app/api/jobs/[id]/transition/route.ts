import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

const transitions: Record<string, readonly string[]> = {
  DRAFT: ['DISCOVERY', 'CANCELLED'],
  DISCOVERY: ['SPEC_REVIEW', 'BLOCKED', 'CANCELLED'],
  SPEC_REVIEW: ['PLANNED', 'BLOCKED', 'CANCELLED'],
  PLANNED: ['QUEUED', 'PAUSED', 'CANCELLED'],
  QUEUED: ['RUNNING', 'PAUSED', 'CANCELLED'],
  RUNNING: ['VALIDATING', 'PAUSED', 'BLOCKED', 'FAILED'],
  VALIDATING: ['READY_FOR_REVIEW', 'RUNNING', 'FAILED'],
  READY_FOR_REVIEW: ['READY_TO_DEPLOY', 'RUNNING', 'CANCELLED'],
  READY_TO_DEPLOY: ['DEPLOYED', 'BLOCKED'],
  PAUSED: ['QUEUED', 'RUNNING', 'CANCELLED'],
  BLOCKED: ['PLANNED', 'CANCELLED'],
  FAILED: ['PLANNED', 'CANCELLED'],
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { target?: unknown; reason?: unknown } | null;
  const target = typeof input?.target === 'string' ? input.target.toUpperCase() : '';
  if (!transitions[access.job.status]?.includes(target)) return NextResponse.json({ error: 'invalid_transition', from: access.job.status, allowed: transitions[access.job.status] ?? [] }, { status: 409 });

  if (target === 'RUNNING') {
    const usage = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM usage_ledger WHERE project_id=?').bind(access.job.project_id).first<{ amount: number }>();
    if ((usage?.amount ?? 0) >= access.job.budget_limit) return NextResponse.json({ error: 'budget_exhausted' }, { status: 402 });
  }
  if (target === 'READY_TO_DEPLOY' || target === 'DEPLOYED') {
    const approval = await env.DB.prepare("SELECT id FROM approvals WHERE job_id=? AND kind=? AND status='approved' LIMIT 1").bind(id, target === 'DEPLOYED' ? 'production' : 'release').first();
    if (!approval) return NextResponse.json({ error: 'approval_required', kind: target === 'DEPLOYED' ? 'production' : 'release' }, { status: 409 });
  }

  const now = Date.now();
  const changed = await env.DB.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=? AND status=?').bind(target, now, id, access.job.status).run();
  if (changed.meta.changes !== 1) return NextResponse.json({ error: 'transition_conflict' }, { status: 409 });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, 'job.transition', 'info', `Job ${access.job.status} -> ${target}`, 0, now),
    env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.organization_id, access.user.userId, 'job.transition', 'job', id, JSON.stringify({ from: access.job.status, to: target, reason: typeof input?.reason === 'string' ? input.reason.slice(0, 500) : null }), now),
  ]);
  return NextResponse.json({ id, previousStatus: access.job.status, status: target, updatedAt: now });
}

