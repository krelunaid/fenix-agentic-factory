import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { redactSecrets } from '../../../../../lib/integrations/policy';

export const dynamic = 'force-dynamic';

const supportedKinds = new Set(['ai', 'source', 'deploy', 'database', 'payment', 'email', 'storage', 'webhook', 'mcp', 'mobile_build', 'voice']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare("SELECT id,kind,provider,config_json,status,last_checked_at,created_at,revoked_at FROM provider_connections WHERE organization_id=? AND (project_id=? OR project_id IS NULL) ORDER BY created_at DESC").bind(access.organizationId, id).all();
  return NextResponse.json({ connections: rows.results.map((row) => ({ ...row, config_json: redactSecrets(JSON.parse(String(row.config_json ?? '{}'))) })) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; connectionId?: unknown; kind?: unknown; provider?: unknown; secretRef?: unknown; config?: unknown } | null;
  if (input?.action === 'revoke' && typeof input.connectionId === 'string') {
    const now = Date.now();
    const result = await env.DB.prepare("UPDATE provider_connections SET status='revoked',secret_ref=NULL,revoked_at=? WHERE id=? AND organization_id=? AND (project_id=? OR project_id IS NULL) AND status!='revoked'").bind(now, input.connectionId, access.organizationId, id).run();
    if (result.meta.changes !== 1) return NextResponse.json({ error: 'connection_not_found' }, { status: 404 });
    await env.DB.prepare("UPDATE source_connections SET status='revoked',secret_ref='',revoked_at=? WHERE id=? AND organization_id=?").bind(now, input.connectionId, access.organizationId).run();
    return NextResponse.json({ id: input.connectionId, status: 'revoked', revokedAt: now });
  }
  if (input?.action === 'connect' && typeof input.kind === 'string' && supportedKinds.has(input.kind) && typeof input.provider === 'string') {
    if (typeof input.secretRef === 'string' && !input.secretRef.startsWith('secret://')) return NextResponse.json({ error: 'raw_secrets_forbidden_use_secret_broker' }, { status: 400 });
    const connectionId = crypto.randomUUID();
    const now = Date.now();
    const statements = [env.DB.prepare("INSERT INTO provider_connections (id,organization_id,project_id,kind,provider,secret_ref,config_json,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
      .bind(connectionId, access.organizationId, id, input.kind, input.provider.slice(0, 80), typeof input.secretRef === 'string' ? input.secretRef : null, JSON.stringify(redactSecrets(input.config ?? {})), access.user.userId, now)];
    if (input.kind === 'source') {
      if (typeof input.secretRef !== 'string') return NextResponse.json({ error: 'source_connection_requires_secret_broker_ref' }, { status: 400 });
      statements.push(env.DB.prepare("INSERT INTO source_connections (id,organization_id,provider,installation_ref,secret_ref,status,created_by,created_at) VALUES (?,?,?,?,?,'invalid',?,?)").bind(connectionId, access.organizationId, input.provider.slice(0, 80), null, input.secretRef, access.user.userId, now));
    }
    await env.DB.batch(statements);
    return NextResponse.json({ id: connectionId, status: 'pending', provider: input.provider, next: 'provider_validation_required' }, { status: 201 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
