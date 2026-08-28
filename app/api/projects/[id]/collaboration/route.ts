import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';
const roles = new Set(['owner', 'admin', 'builder', 'reviewer', 'viewer']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [members, comments] = await Promise.all([
    env.DB.prepare('SELECT m.user_id,m.role,m.created_at,u.email,u.display_name FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.created_at').bind(id).all(),
    env.DB.prepare('SELECT id,author_user_id,resource_type,resource_id,parent_id,body,status,created_at,resolved_at FROM comments WHERE project_id=? ORDER BY created_at DESC LIMIT 200').bind(id).all(),
  ]);
  return NextResponse.json({ members: members.results, comments: comments.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const input = await request.json().catch(() => null) as { action?: unknown; email?: unknown; role?: unknown; resourceType?: unknown; resourceId?: unknown; parentId?: unknown; body?: unknown; commentId?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'invite' && typeof input.email === 'string' && typeof input.role === 'string') {
    if (!canOperate(access.role) || !roles.has(input.role)) return NextResponse.json({ error: 'forbidden_or_invalid_role' }, { status: 403 });
    const user = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(input.email.toLowerCase()).first<{ id: string }>();
    if (!user) return NextResponse.json({ error: 'user_must_join_workspace_before_invite' }, { status: 409 });
    await env.DB.prepare('INSERT INTO project_members (project_id,user_id,role,invited_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role').bind(id, user.id, input.role, access.user.userId, now).run();
    return NextResponse.json({ userId: user.id, role: input.role }, { status: 201 });
  }
  if (input?.action === 'comment' && typeof input.resourceType === 'string' && typeof input.resourceId === 'string' && typeof input.body === 'string') {
    const commentId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO comments (id,project_id,author_user_id,resource_type,resource_id,parent_id,body,status,created_at) VALUES (?,?,?,?,?,?,?,'open',?)").bind(commentId, id, access.user.userId, input.resourceType.slice(0, 50), input.resourceId.slice(0, 200), typeof input.parentId === 'string' ? input.parentId : null, input.body.slice(0, 5000), now).run();
    return NextResponse.json({ id: commentId, status: 'open' }, { status: 201 });
  }
  if (input?.action === 'resolve-comment' && typeof input.commentId === 'string' && canOperate(access.role)) {
    const result = await env.DB.prepare("UPDATE comments SET status='resolved',resolved_at=? WHERE id=? AND project_id=? AND status='open'").bind(now, input.commentId, id).run();
    return result.meta.changes === 1 ? NextResponse.json({ id: input.commentId, status: 'resolved' }) : NextResponse.json({ error: 'comment_not_found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
