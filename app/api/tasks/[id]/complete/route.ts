import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireTaskAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireTaskAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.task.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (access.task.status !== 'running') return NextResponse.json({ error: 'task_not_running' }, { status: 409 });
  const input = await request.json().catch(() => null) as { attemptId?: unknown; outcome?: unknown; errorCode?: unknown; cost?: unknown; units?: unknown } | null;
  const attemptId = typeof input?.attemptId === 'string' ? input.attemptId : '';
  const outcome = input?.outcome === 'completed' || input?.outcome === 'failed' ? input.outcome : '';
  if (!attemptId || !outcome) return NextResponse.json({ error: 'invalid_result' }, { status: 400 });
  const attempt = await env.DB.prepare("SELECT id FROM task_attempts WHERE id=? AND task_id=? AND status='running'").bind(attemptId, id).first();
  if (!attempt) return NextResponse.json({ error: 'attempt_not_running' }, { status: 409 });

  const now = Date.now();
  const cost = typeof input?.cost === 'number' && Number.isFinite(input.cost) ? Math.max(0, input.cost) : 0;
  const units = typeof input?.units === 'number' && Number.isFinite(input.units) ? Math.max(0, input.units) : 0;
  const errorCode = typeof input?.errorCode === 'string' ? input.errorCode.slice(0, 100) : null;
  const statements = [
    env.DB.prepare('UPDATE task_attempts SET status=?,error_code=?,completed_at=? WHERE id=? AND status=?').bind(outcome, errorCode, now, attemptId, 'running'),
    env.DB.prepare('UPDATE tasks SET status=?,completed_at=? WHERE id=? AND status=?').bind(outcome, outcome === 'completed' ? now : null, id, 'running'),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,task_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.task.project_id, access.task.job_id, id, `task.${outcome}`, outcome === 'completed' ? 'info' : 'error', outcome === 'completed' ? 'Task completato con evidence registrabile' : `Task fallito${errorCode ? `: ${errorCode}` : ''}`, cost, now),
  ];
  if (cost > 0 || units > 0) statements.push(env.DB.prepare('INSERT INTO usage_ledger (id,organization_id,project_id,task_id,kind,units,amount,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.task.organization_id, access.task.project_id, id, 'task_attempt', units, cost, now));
  await env.DB.batch(statements);
  if (outcome === 'completed') {
    await env.DB.prepare("UPDATE tasks SET status='queued' WHERE job_id=? AND status='blocked' AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks parent ON parent.id=d.depends_on_task_id WHERE d.task_id=tasks.id AND parent.status!='completed')").bind(access.task.job_id).run();
  }
  return NextResponse.json({ taskId: id, attemptId, status: outcome, cost, units, completedAt: now });
}

