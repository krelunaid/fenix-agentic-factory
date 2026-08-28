import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { redactSecrets } from '../../../../../lib/integrations/policy';
import { decryptSecret, encryptSecret } from '../../../../../lib/secret-broker';

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
  const input = await request.json().catch(() => null) as { action?: unknown; connectionId?: unknown; kind?: unknown; provider?: unknown; secretRef?: unknown; secret?: unknown; config?: unknown } | null;
  if (input?.action === 'revoke' && typeof input.connectionId === 'string') {
    const now = Date.now();
    const connection = await env.DB.prepare('SELECT secret_ref FROM provider_connections WHERE id=? AND organization_id=? AND (project_id=? OR project_id IS NULL)').bind(input.connectionId, access.organizationId, id).first<{ secret_ref: string | null }>();
    const result = await env.DB.prepare("UPDATE provider_connections SET status='revoked',secret_ref=NULL,revoked_at=? WHERE id=? AND organization_id=? AND (project_id=? OR project_id IS NULL) AND status!='revoked'").bind(now, input.connectionId, access.organizationId, id).run();
    if (result.meta.changes !== 1) return NextResponse.json({ error: 'connection_not_found' }, { status: 404 });
    const secretId = connection?.secret_ref?.startsWith('secret://') ? connection.secret_ref.slice('secret://'.length) : null;
    await env.DB.batch([
      env.DB.prepare("UPDATE source_connections SET status='revoked',secret_ref='',revoked_at=? WHERE id=? AND organization_id=?").bind(now, input.connectionId, access.organizationId),
      env.DB.prepare("UPDATE ai_credentials SET status='revoked',revoked_at=? WHERE id=? AND organization_id=? AND status!='revoked'").bind(now, input.connectionId, access.organizationId),
      ...(secretId ? [env.DB.prepare('UPDATE secret_records SET revoked_at=? WHERE id=? AND organization_id=? AND revoked_at IS NULL').bind(now, secretId, access.organizationId)] : []),
    ]);
    return NextResponse.json({ id: input.connectionId, status: 'revoked', revokedAt: now });
  }
  if (input?.action === 'validate' && typeof input.connectionId === 'string') {
    if (!env.CREDENTIALS_MASTER_KEY) return NextResponse.json({ error: 'secret_broker_not_configured' }, { status: 503 });
    const connection = await env.DB.prepare("SELECT c.id,c.kind,c.provider,c.secret_ref,s.id AS secret_id,s.ciphertext,s.iv FROM provider_connections c LEFT JOIN secret_records s ON s.id=substr(c.secret_ref,10) AND s.organization_id=c.organization_id AND s.revoked_at IS NULL WHERE c.id=? AND c.organization_id=? AND (c.project_id=? OR c.project_id IS NULL) AND c.status!='revoked'").bind(input.connectionId, access.organizationId, id).first<{ id: string; kind: string; provider: string; secret_ref: string | null; secret_id: string | null; ciphertext: string | null; iv: string | null }>();
    if (!connection || !connection.secret_id || !connection.ciphertext || !connection.iv) return NextResponse.json({ error: 'connection_secret_not_ready' }, { status: 409 });
    const secret = await decryptSecret(env.CREDENTIALS_MASTER_KEY, connection.ciphertext, connection.iv, `${access.organizationId}:${id}:${connection.secret_id}`);
    const provider = connection.provider.toLowerCase();
    let endpoint: string;
    let headers: Record<string, string>;
    if (provider === 'github') {
      endpoint = 'https://api.github.com/user'; headers = { authorization: `Bearer ${secret}`, accept: 'application/vnd.github+json', 'user-agent': 'FENIX-Control-Plane/2' };
    } else if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/models'; headers = { authorization: `Bearer ${secret}` };
    } else if (provider === 'stripe') {
      endpoint = 'https://api.stripe.com/v1/balance'; headers = { authorization: `Basic ${btoa(`${secret}:`)}` };
    } else {
      return NextResponse.json({ error: 'provider_validation_adapter_not_available', provider }, { status: 422 });
    }
    const checkedAt = Date.now();
    let healthy = false;
    let statusCode = 0;
    try {
      const response = await fetch(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      statusCode = response.status;
      healthy = response.ok;
    } catch {
      healthy = false;
    }
    const status = healthy ? 'healthy' : 'degraded';
    const statements: D1PreparedStatement[] = [
      env.DB.prepare('UPDATE provider_connections SET status=?,last_checked_at=? WHERE id=? AND organization_id=?').bind(status, checkedAt, connection.id, access.organizationId),
      env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.organizationId, access.user.userId, 'connection.validate', 'provider_connection', connection.id, JSON.stringify({ provider, status, statusCode }), checkedAt),
    ];
    if (connection.kind === 'source') statements.push(env.DB.prepare("UPDATE source_connections SET status=? WHERE id=? AND organization_id=? AND status!='revoked'").bind(healthy ? 'active' : 'invalid', connection.id, access.organizationId));
    if (connection.kind === 'ai' && healthy) statements.push(env.DB.prepare("INSERT INTO ai_credentials (id,organization_id,provider,mode,secret_ref,status,created_by,created_at) VALUES (?,?,?,'byok',?,'active',?,?) ON CONFLICT(id) DO UPDATE SET secret_ref=excluded.secret_ref,status='active',revoked_at=NULL").bind(connection.id, access.organizationId, provider, connection.secret_ref, access.user.userId, checkedAt));
    await env.DB.batch(statements);
    return NextResponse.json({ id: connection.id, provider, status, checkedAt, validationStatusCode: statusCode || null }, { status: healthy ? 200 : 422 });
  }
  if (input?.action === 'connect' && typeof input.kind === 'string' && supportedKinds.has(input.kind) && typeof input.provider === 'string') {
    if (typeof input.secret === 'string' && typeof input.secretRef === 'string') return NextResponse.json({ error: 'secret_and_secret_ref_are_mutually_exclusive' }, { status: 400 });
    if (typeof input.secretRef === 'string' && !input.secretRef.startsWith('secret://')) return NextResponse.json({ error: 'raw_secrets_forbidden_use_secret_broker' }, { status: 400 });
    const connectionId = crypto.randomUUID();
    const now = Date.now();
    let secretRef = typeof input.secretRef === 'string' ? input.secretRef : null;
    const statements: D1PreparedStatement[] = [];
    if (secretRef) {
      const existingSecret = await env.DB.prepare('SELECT id FROM secret_records WHERE id=? AND organization_id=? AND (project_id=? OR project_id IS NULL) AND revoked_at IS NULL').bind(secretRef.slice('secret://'.length), access.organizationId, id).first();
      if (!existingSecret) return NextResponse.json({ error: 'secret_ref_not_found' }, { status: 404 });
    }
    if (typeof input.secret === 'string') {
      if (!env.CREDENTIALS_MASTER_KEY) return NextResponse.json({ error: 'secret_broker_not_configured' }, { status: 503 });
      const secretId = crypto.randomUUID();
      const encrypted = await encryptSecret(env.CREDENTIALS_MASTER_KEY, input.secret, `${access.organizationId}:${id}:${secretId}`);
      secretRef = `secret://${secretId}`;
      statements.push(env.DB.prepare('INSERT INTO secret_records (id,organization_id,project_id,ciphertext,iv,created_by,created_at) VALUES (?,?,?,?,?,?,?)').bind(secretId, access.organizationId, id, encrypted.ciphertext, encrypted.iv, access.user.userId, now));
    }
    statements.push(env.DB.prepare("INSERT INTO provider_connections (id,organization_id,project_id,kind,provider,secret_ref,config_json,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
      .bind(connectionId, access.organizationId, id, input.kind, input.provider.slice(0, 80), secretRef, JSON.stringify(redactSecrets(input.config ?? {})), access.user.userId, now));
    if (input.kind === 'source') {
      if (!secretRef) return NextResponse.json({ error: 'source_connection_requires_secret_broker_ref' }, { status: 400 });
      statements.push(env.DB.prepare("INSERT INTO source_connections (id,organization_id,provider,installation_ref,secret_ref,status,created_by,created_at) VALUES (?,?,?,?,?,'invalid',?,?)").bind(connectionId, access.organizationId, input.provider.slice(0, 80), null, secretRef, access.user.userId, now));
    }
    await env.DB.batch(statements);
    return NextResponse.json({ id: connectionId, status: 'pending', provider: input.provider, next: 'provider_validation_required' }, { status: 201 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
