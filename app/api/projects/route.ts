import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { ensureCoreSchema } from '../../../db';

export const dynamic = 'force-dynamic';

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  tone: string;
  updated_at: number;
};

function projectJson(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    progress: row.progress,
    tone: row.tone,
    updated: new Date(row.updated_at).toISOString(),
  };
}

async function requireCoreUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureCoreSchema();
  const now = Date.now();
  const orgId = `org_${user.userId}`;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, updated_at=excluded.updated_at').bind(user.userId, user.email, user.displayName, now, now),
    env.DB.prepare('INSERT OR IGNORE INTO organizations (id,name,slug,created_at) VALUES (?,?,?,?)').bind(orgId, `${user.displayName} Workspace`, `workspace-${user.userId.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, now),
    env.DB.prepare('INSERT OR IGNORE INTO organization_members (organization_id,user_id,role,created_at) VALUES (?,?,?,?)').bind(orgId, user.userId, 'owner', now),
  ]);
  return { user, orgId };
}

export async function GET() {
  const core = await requireCoreUser();
  if (!core) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  const result = await env.DB.prepare('SELECT id,name,description,status,progress,tone,updated_at FROM projects WHERE organization_id=? ORDER BY updated_at DESC LIMIT 50').bind(core.orgId).all<ProjectRow>();
  return NextResponse.json({ user: core.user, organizationId: core.orgId, projects: result.results.map(projectJson) });
}

export async function POST(request: Request) {
  const core = await requireCoreUser();
  if (!core) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  const input = await request.json().catch(() => null) as { name?: unknown; description?: unknown } | null;
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 100) : '';
  const description = typeof input?.description === 'string' ? input.description.trim().slice(0, 600) : '';
  if (name.length < 3) return NextResponse.json({ error: 'invalid_project_name' }, { status: 400 });

  const now = Date.now();
  const projectId = crypto.randomUUID();
  const specificationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const taskDefinitions = [
    ['Analisi del brief', 4, 'ready'],
    ['Piano architetturale', 5, 'blocked'],
    ['Scaffold full-stack', 8, 'blocked'],
    ['Quality gate', 11, 'blocked'],
  ] as const;
  const taskIds = taskDefinitions.map(() => crypto.randomUUID());
  const statements = [
    env.DB.prepare('INSERT INTO projects (id,organization_id,name,description,status,progress,tone,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(projectId, core.orgId, name, description || 'Nuovo progetto FENIX', 'Planning', 8, 'violet', core.user.userId, now, now),
    env.DB.prepare('INSERT INTO specifications (id,project_id,version,objective,assumptions_json,flows_json,scenarios_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(specificationId, projectId, 1, description || name, '[]', '[]', '[]', core.user.userId, now),
    env.DB.prepare('INSERT INTO jobs (id,project_id,status,budget_limit,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(jobId, projectId, 'DRAFT', 25, now, now),
    ...taskDefinitions.map(([title, phase, status], index) => env.DB.prepare('INSERT INTO tasks (id,job_id,project_id,phase,title,status,priority,risk_level,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(taskIds[index], jobId, projectId, phase, title, status, index, phase >= 8 ? 'medium' : 'low', `${projectId}:${phase}:${index}`, now)),
    ...taskIds.slice(1).map((taskId, index) => env.DB.prepare('INSERT INTO task_dependencies (task_id,depends_on_task_id) VALUES (?,?)').bind(taskId, taskIds[index])),
    env.DB.prepare('INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), crypto.randomUUID(), projectId, jobId, 'project.created', 'info', 'Progetto e task graph iniziale creati', 0, now),
    env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), core.orgId, core.user.userId, 'project.create', 'project', projectId, JSON.stringify({ name }), now),
  ];
  await env.DB.batch(statements);

  return NextResponse.json({ project: projectJson({ id: projectId, name, description: description || 'Nuovo progetto FENIX', status: 'Planning', progress: 8, tone: 'violet', updated_at: now }) }, { status: 201 });
}
