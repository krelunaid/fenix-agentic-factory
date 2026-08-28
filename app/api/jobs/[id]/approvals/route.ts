import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { canProjectRole, type ProjectRole } from '../../../../../lib/collaboration/rbac';

export const dynamic = 'force-dynamic';

const allowedKinds = new Set(['release', 'production', 'domain', 'payment', 'external_send', 'destructive_data', 'budget']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [result, votes] = await Promise.all([
    env.DB.prepare('SELECT id,kind,status,reason,required_approvals,required_rejections,requested_by,decided_by,created_at,decided_at FROM approvals WHERE job_id=? ORDER BY created_at DESC').bind(id).all(),
    env.DB.prepare('SELECT v.approval_id,v.user_id,v.decision,v.reason,v.created_at FROM approval_votes v JOIN approvals a ON a.id=v.approval_id WHERE a.job_id=? ORDER BY v.created_at').bind(id).all(),
  ]);
  return NextResponse.json({ approvals: result.results, votes: votes.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const input = await request.json().catch(() => null) as { kind?: unknown; reason?: unknown; approvalId?: unknown; decision?: unknown; requiredApprovals?: unknown; requiredRejections?: unknown } | null;
  const now = Date.now();

  if (typeof input?.approvalId === 'string' && (input.decision === 'approved' || input.decision === 'rejected')) {
    if (!canProjectRole(access.job.role as ProjectRole, 'approve')) return NextResponse.json({ error: 'decision_forbidden' }, { status: 403 });
    const approval = await env.DB.prepare("SELECT id,required_approvals,required_rejections FROM approvals WHERE id=? AND job_id=? AND status='pending'").bind(input.approvalId, id).first<{ id: string; required_approvals: number; required_rejections: number }>();
    if (!approval) return NextResponse.json({ error: 'approval_conflict' }, { status: 409 });
    const vote = await env.DB.prepare('INSERT OR IGNORE INTO approval_votes (approval_id,user_id,decision,reason,created_at) VALUES (?,?,?,?,?)').bind(input.approvalId, access.user.userId, input.decision, typeof input.reason === 'string' ? input.reason.slice(0, 1000) : '', now).run();
    if (vote.meta.changes !== 1) return NextResponse.json({ error: 'approval_vote_conflict' }, { status: 409 });
    const counts = await env.DB.prepare("SELECT SUM(CASE WHEN decision='approved' THEN 1 ELSE 0 END) AS approvals,SUM(CASE WHEN decision='rejected' THEN 1 ELSE 0 END) AS rejections FROM approval_votes WHERE approval_id=?").bind(input.approvalId).first<{ approvals: number; rejections: number }>();
    const approvals = counts?.approvals ?? 0;
    const rejections = counts?.rejections ?? 0;
    const status = rejections >= approval.required_rejections ? 'rejected' : approvals >= approval.required_approvals ? 'approved' : 'pending';
    if (status !== 'pending') await env.DB.prepare("UPDATE approvals SET status=?,decided_by=?,decided_at=? WHERE id=? AND job_id=? AND status='pending'").bind(status, access.user.userId, now, input.approvalId, id).run();
    await env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.job.organization_id, access.user.userId, 'approval.decide', 'approval', input.approvalId, JSON.stringify({ decision: input.decision }), now).run();
    return NextResponse.json({ id: input.approvalId, status, votes: { approvals, rejections }, quorum: { approvals: approval.required_approvals, rejections: approval.required_rejections } });
  }

  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const kind = typeof input?.kind === 'string' ? input.kind : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 1000) : '';
  if (!allowedKinds.has(kind) || !reason) return NextResponse.json({ error: 'invalid_approval_request' }, { status: 400 });
  const requiredApprovals = typeof input?.requiredApprovals === 'number' && Number.isInteger(input.requiredApprovals) ? Math.min(Math.max(input.requiredApprovals, 1), 10) : 1;
  const requiredRejections = typeof input?.requiredRejections === 'number' && Number.isInteger(input.requiredRejections) ? Math.min(Math.max(input.requiredRejections, 1), 10) : 1;
  const approvalId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO approvals (id,project_id,job_id,kind,status,requested_by,reason,required_approvals,required_rejections,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(approvalId, access.job.project_id, id, kind, 'pending', access.user.userId, reason, requiredApprovals, requiredRejections, now),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, 'approval.requested', 'warning', `Approvazione richiesta: ${kind}`, 0, now),
  ]);
  return NextResponse.json({ id: approvalId, kind, status: 'pending', quorum: { approvals: requiredApprovals, rejections: requiredRejections } }, { status: 201 });
}
