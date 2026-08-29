import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { buildTaskDefinitions } from '../../../../../lib/build-plane/task-graph';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { instruction?: unknown } | null;
  const instruction = typeof input?.instruction === 'string' ? input.instruction.trim().slice(0, 2_000) : '';
  if (instruction.length < 3) return NextResponse.json({ error: 'instruction_required' }, { status: 400 });
  const project = await env.DB.prepare('SELECT description FROM projects WHERE id=?').bind(id).first<{ description: string }>();
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const latest = await env.DB.prepare('SELECT COALESCE(MAX(version),0) AS version FROM specifications WHERE project_id=?').bind(id).first<{ version: number }>();
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const specificationId = crypto.randomUUID();
  const taskIds = buildTaskDefinitions.map(() => crypto.randomUUID());
  const description = `${project.description}\n\nModifica richiesta: ${instruction}`.slice(0, 8_000);
  await env.DB.batch([
    env.DB.prepare("UPDATE projects SET description=?,status='Planning',progress=5,updated_at=? WHERE id=?").bind(description, now, id),
    env.DB.prepare('INSERT INTO specifications (id,project_id,version,objective,assumptions_json,flows_json,scenarios_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(specificationId, id, (latest?.version ?? 0) + 1, description, JSON.stringify([{ kind: 'revision_instruction', value: instruction }]), '[]', '[]', access.user.userId, now),
    env.DB.prepare("INSERT INTO jobs (id,project_id,status,budget_limit,created_at,updated_at) VALUES (?,?,'DRAFT',25,?,?)").bind(jobId, id, now, now),
    ...buildTaskDefinitions.map(([title, phase, status], index) => env.DB.prepare('INSERT INTO tasks (id,job_id,project_id,phase,title,status,priority,risk_level,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(taskIds[index], jobId, id, phase, title, status, index, phase >= 8 ? 'medium' : 'low', `${id}:${jobId}:${phase}:${index}`, now)),
    ...taskIds.slice(1).map((taskId, index) => env.DB.prepare('INSERT INTO task_dependencies (task_id,depends_on_task_id) VALUES (?,?)').bind(taskId, taskIds[index])),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), id, jobId, 'revision.requested', 'info', `Nuova modifica richiesta: ${instruction.slice(0, 180)}`, 0, now),
  ]);
  return NextResponse.json({ jobId, specificationVersion: (latest?.version ?? 0) + 1 }, { status: 201 });
}
