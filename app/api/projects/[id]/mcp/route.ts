import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';
const permissions = new Set(['project.read', 'project.create', 'message.send', 'preview.read', 'job.pause', 'job.resume', 'deploy.request']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT id,direction,server_url,permissions_json,status,rate_limit_per_minute,created_at,revoked_at FROM mcp_connections WHERE organization_id=? AND (project_id=? OR project_id IS NULL) ORDER BY created_at DESC').bind(access.organizationId, id).all();
  return NextResponse.json({ connections: rows.results, serverStatus: 'adapter_ready_requires_oauth_provider' });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; connectionId?: unknown; serverUrl?: unknown; permissions?: unknown; rateLimitPerMinute?: unknown; oauthClientRef?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'revoke' && typeof input.connectionId === 'string') {
    const result = await env.DB.prepare("UPDATE mcp_connections SET status='revoked',oauth_client_ref=NULL,revoked_at=? WHERE id=? AND organization_id=? AND project_id=? AND status!='revoked'").bind(now, input.connectionId, access.organizationId, id).run();
    return result.meta.changes === 1 ? NextResponse.json({ id: input.connectionId, status: 'revoked' }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (input?.action === 'connect' && typeof input.serverUrl === 'string') {
    let url: URL;
    try { url = new URL(input.serverUrl); } catch { return NextResponse.json({ error: 'invalid_server_url' }, { status: 400 }); }
    if (url.protocol !== 'https:') return NextResponse.json({ error: 'https_required' }, { status: 400 });
    const granted = Array.isArray(input.permissions) ? input.permissions.filter((value): value is string => typeof value === 'string' && permissions.has(value)) : [];
    if (!granted.length) return NextResponse.json({ error: 'permissions_required' }, { status: 400 });
    const connectionId = crypto.randomUUID();
    const rateLimit = typeof input.rateLimitPerMinute === 'number' ? Math.min(300, Math.max(1, Math.round(input.rateLimitPerMinute))) : 30;
    await env.DB.prepare("INSERT INTO mcp_connections (id,organization_id,project_id,direction,server_url,oauth_client_ref,permissions_json,status,rate_limit_per_minute,created_by,created_at) VALUES (?,?,?,'client',?,?,?,'pending',?,?,?)").bind(connectionId, access.organizationId, id, url.toString(), typeof input.oauthClientRef === 'string' ? input.oauthClientRef : null, JSON.stringify(granted), rateLimit, access.user.userId, now).run();
    return NextResponse.json({ id: connectionId, status: 'pending', next: 'oauth_validation_required' }, { status: 201 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
