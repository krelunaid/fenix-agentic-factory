import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (access.job.status !== 'RUNNING') return NextResponse.json({ error: 'job_not_running' }, { status: 409 });
  const input = await request.json().catch(() => null) as { workerId?: unknown } | null;
  const workerId = typeof input?.workerId === 'string' ? input.workerId.slice(0, 100) : 'control-plane';
  const candidate = await env.DB.prepare("SELECT t.id,t.title,t.phase FROM tasks t WHERE t.job_id=? AND t.status IN ('ready','queued','blocked') AND NOT EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks parent ON parent.id=d.depends_on_task_id WHERE d.task_id=t.id AND parent.status!='completed') ORDER BY t.priority ASC LIMIT 1").bind(id).first<{ id: string; title: string; phase: number }>();
  if (!candidate) return NextResponse.json({ task: null, reason: 'no_runnable_task' });
  const claimed = await env.DB.prepare("UPDATE tasks SET status='running' WHERE id=? AND status IN ('ready','queued','blocked')").bind(candidate.id).run();
  if (claimed.meta.changes !== 1) return NextResponse.json({ error: 'claim_conflict' }, { status: 409 });
  const attemptCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM task_attempts WHERE task_id=?').bind(candidate.id).first<{ count: number }>();
  const now = Date.now();
  const attemptId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO task_attempts (id,task_id,attempt_number,status,worker_id,started_at) VALUES (?,?,?,?,?,?)').bind(attemptId, candidate.id, (attemptCount?.count ?? 0) + 1, 'running', workerId, now),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,task_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), access.job.project_id, id, candidate.id, 'task.claimed', 'info', `Task avviato: ${candidate.title}`, 0, now),
  ]);
  return NextResponse.json({ task: candidate, attempt: { id: attemptId, number: (attemptCount?.count ?? 0) + 1, workerId, startedAt: now } });
}

