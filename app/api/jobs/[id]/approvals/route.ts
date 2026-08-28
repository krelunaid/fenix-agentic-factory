import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

const allowedKinds = new Set(['release', 'production', 'domain', 'payment', 'external_send', 'destructive_data', 'budget']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const result = await env.DB.prepare('SELECT id,kind,status,reason,requested_by,decided_by,created_at,decided_at FROM approvals WHERE job_id=? ORDER BY created_at DESC').bind(id).all();
  return NextResponse.json({ approvals: result.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { kind?: unknown; reason?: unknown; approvalId?: unknown; decision?: unknown } | null;
  const now = Date.now();

  if (typeof input?.approvalId === 'string' && (input.decision === 'approved' || input.decision === 'rejected')) {
    if (access.job.role !== 'owner' && access.job.role !== 'admin') return NextResponse.json({ error: 'decision_forbidden' }, { status: 403 });
    const changed = await env.DB.prepare("UPDATE approvals SET status=?,decided_by=?,decided_at=? WHERE id=? AND job_id=? AND status='pending'").bind(input.decision, access.user.userId, now, input.approvalId, id).run();
    if (changed.meta.changes !== 1) return NextResponse.json({ error: 'approval_conflict' }, { status: 409 });
    await env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.organization_id, access.user.userId, 'approval.decide', 'approval', input.approvalId, JSON.stringify({ decision: input.decision }), now).run();
    return NextResponse.json({ id: input.approvalId, status: input.decision });
  }

  const kind = typeof input?.kind === 'string' ? input.kind : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 1000) : '';
  if (!allowedKinds.has(kind) || !reason) return NextResponse.json({ error: 'invalid_approval_request' }, { status: 400 });
  const approvalId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO approvals (id,project_id,job_id,kind,status,requested_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(approvalId, access.job.project_id, id, kind, 'pending', access.user.userId, reason, now),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, 'approval.requested', 'warning', `Approvazione richiesta: ${kind}`, 0, now),
  ]);
  return NextResponse.json({ id: approvalId, kind, status: 'pending' }, { status: 201 });
}

