import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [project, brief, job, events, approvals, usage, repositoryFiles, qualityRuns, deployments, previews] = await Promise.all([
    env.DB.prepare('SELECT id,name,description,status,progress,tone,created_at,updated_at FROM projects WHERE id=?').bind(id).first(),
    env.DB.prepare('SELECT id,version,objective,assumptions_json,flows_json,scenarios_json,approved_at,created_at FROM specifications WHERE project_id=? ORDER BY version DESC LIMIT 1').bind(id).first(),
    env.DB.prepare('SELECT id,status,budget_limit,created_at,updated_at FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').bind(id).first<{ id: string; status: string; budget_limit: number; created_at: number; updated_at: number }>(),
    env.DB.prepare('SELECT rowid AS sequence,id,trace_id,job_id,task_id,type,severity,human_message,cost_delta,created_at FROM build_events WHERE project_id=? ORDER BY rowid DESC LIMIT 50').bind(id).all(),
    env.DB.prepare('SELECT id,job_id,kind,status,reason,created_at,decided_at FROM approvals WHERE project_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all(),
    env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(units),0) AS units FROM usage_ledger WHERE project_id=?').bind(id).first(),
    env.DB.prepare('SELECT f.path,f.sha256,f.byte_size,f.language,f.generated,f.indexed_at FROM repository_files f JOIN repositories r ON r.id=f.repository_id WHERE r.project_id=? ORDER BY f.path LIMIT 500').bind(id).all(),
    env.DB.prepare('SELECT q.id,q.kind,q.status,q.summary,q.duration_ms,q.started_at,q.completed_at FROM quality_runs q JOIN jobs j ON j.id=q.job_id WHERE j.project_id=? ORDER BY q.started_at DESC LIMIT 50').bind(id).all(),
    env.DB.prepare('SELECT d.id,d.environment,d.url,d.status,d.created_at,d.completed_at,r.version FROM deployment_records d JOIN releases r ON r.id=d.release_id WHERE r.project_id=? ORDER BY d.created_at DESC LIMIT 30').bind(id).all(),
    env.DB.prepare("SELECT id,url,status,port,expires_at,created_at,CASE WHEN status='ready' AND expires_at>? THEN 1 ELSE 0 END AS live FROM preview_sessions WHERE project_id=? ORDER BY created_at DESC LIMIT 10").bind(Date.now(), id).all(),
  ]);
  const tasks = job ? await env.DB.prepare("SELECT t.id,t.phase,t.title,t.status,t.priority,t.risk_level,t.created_at,t.completed_at,(SELECT COUNT(*) FROM task_dependencies d WHERE d.task_id=t.id) AS dependencies,(SELECT COUNT(*) FROM task_attempts a WHERE a.task_id=t.id) AS attempts FROM tasks t WHERE t.job_id=? ORDER BY t.priority ASC").bind(job.id).all() : { results: [] };

  return NextResponse.json({ project, brief, job, tasks: tasks.results, events: events.results.reverse(), approvals: approvals.results, usage, repositoryFiles: repositoryFiles.results, qualityRuns: qualityRuns.results, deployments: deployments.results, previews: previews.results, role: access.role });
}
