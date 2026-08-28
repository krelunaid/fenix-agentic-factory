import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [project, brief, job, events, approvals, usage] = await Promise.all([
    env.DB.prepare('SELECT id,name,description,status,progress,tone,created_at,updated_at FROM projects WHERE id=?').bind(id).first(),
    env.DB.prepare('SELECT id,version,objective,assumptions_json,flows_json,scenarios_json,approved_at,created_at FROM specifications WHERE project_id=? ORDER BY version DESC LIMIT 1').bind(id).first(),
    env.DB.prepare('SELECT id,status,budget_limit,created_at,updated_at FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').bind(id).first<{ id: string; status: string; budget_limit: number; created_at: number; updated_at: number }>(),
    env.DB.prepare('SELECT rowid AS sequence,id,trace_id,job_id,task_id,type,severity,human_message,cost_delta,created_at FROM build_events WHERE project_id=? ORDER BY rowid DESC LIMIT 50').bind(id).all(),
    env.DB.prepare('SELECT id,job_id,kind,status,reason,created_at,decided_at FROM approvals WHERE project_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all(),
    env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(units),0) AS units FROM usage_ledger WHERE project_id=?').bind(id).first(),
  ]);
  const tasks = job ? await env.DB.prepare("SELECT t.id,t.phase,t.title,t.status,t.priority,t.risk_level,t.created_at,t.completed_at,(SELECT COUNT(*) FROM task_dependencies d WHERE d.task_id=t.id) AS dependencies,(SELECT COUNT(*) FROM task_attempts a WHERE a.task_id=t.id) AS attempts FROM tasks t WHERE t.job_id=? ORDER BY t.priority ASC").bind(job.id).all() : { results: [] };

  return NextResponse.json({ project, brief, job, tasks: tasks.results, events: events.results.reverse(), approvals: approvals.results, usage, role: access.role });
}

