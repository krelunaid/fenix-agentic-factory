import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../../chatgpt-auth';
import { ensureCoreSchema } from '../../../../../db';

export const dynamic = 'force-dynamic';

async function canAccess(projectId: string, userId: string) {
  const row = await env.DB.prepare('SELECT p.id FROM projects p JOIN organization_members m ON m.organization_id=p.organization_id WHERE p.id=? AND m.user_id=? LIMIT 1').bind(projectId, userId).first();
  return Boolean(row);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  await ensureCoreSchema();
  const { id } = await context.params;
  if (!(await canAccess(id, user.userId))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const brief = await env.DB.prepare('SELECT id,version,objective,assumptions_json,flows_json,scenarios_json,approved_at,created_at FROM specifications WHERE project_id=? ORDER BY version DESC LIMIT 1').bind(id).first();
  return NextResponse.json({ brief });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  await ensureCoreSchema();
  const { id } = await context.params;
  if (!(await canAccess(id, user.userId))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const input = await request.json().catch(() => null) as { objective?: unknown; assumptions?: unknown[]; flows?: unknown[]; scenarios?: unknown[] } | null;
  const objective = typeof input?.objective === 'string' ? input.objective.trim().slice(0, 2000) : '';
  if (!objective) return NextResponse.json({ error: 'invalid_objective' }, { status: 400 });
  const current = await env.DB.prepare('SELECT COALESCE(MAX(version),0) AS version FROM specifications WHERE project_id=?').bind(id).first<{ version: number }>();
  const now = Date.now();
  const specificationId = crypto.randomUUID();
  const project = await env.DB.prepare('SELECT organization_id FROM projects WHERE id=?').bind(id).first<{ organization_id: string }>();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO specifications (id,project_id,version,objective,assumptions_json,flows_json,scenarios_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(specificationId, id, (current?.version ?? 0) + 1, objective, JSON.stringify(input?.assumptions ?? []), JSON.stringify(input?.flows ?? []), JSON.stringify(input?.scenarios ?? []), user.userId, now),
    env.DB.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now, id),
    env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), project!.organization_id, user.userId, 'specification.update', 'project', id, JSON.stringify({ version: (current?.version ?? 0) + 1 }), now),
  ]);
  return NextResponse.json({ id: specificationId, version: (current?.version ?? 0) + 1 });
}

