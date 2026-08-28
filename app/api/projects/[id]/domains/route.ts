import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { validateHostname } from '../../../../../lib/deploy/release-policy';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT id,deployment_id,hostname,status,dns_challenge_json,ssl_status,created_at,verified_at FROM custom_domains WHERE project_id=? ORDER BY created_at DESC').bind(id).all();
  return NextResponse.json({ domains: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { hostname?: unknown; deploymentId?: unknown } | null;
  if (typeof input?.hostname !== 'string') return NextResponse.json({ error: 'invalid_hostname' }, { status: 400 });
  let hostname;
  try { hostname = validateHostname(input.hostname); } catch { return NextResponse.json({ error: 'invalid_hostname' }, { status: 400 }); }
  if (typeof input.deploymentId === 'string') {
    const deployment = await env.DB.prepare("SELECT d.id FROM deployment_records d JOIN releases r ON r.id=d.release_id WHERE d.id=? AND r.project_id=? AND d.status='ready'").bind(input.deploymentId, id).first();
    if (!deployment) return NextResponse.json({ error: 'deployment_not_ready' }, { status: 409 });
  }
  const domainId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO custom_domains (id,project_id,deployment_id,hostname,status,dns_challenge_json,ssl_status,created_at) VALUES (?,?,?,?,'pending_dns','{}','pending',?)").bind(domainId, id, typeof input.deploymentId === 'string' ? input.deploymentId : null, hostname, now).run();
  return NextResponse.json({ id: domainId, hostname, status: 'pending_dns', execution: 'domain_provider_required' }, { status: 202 });
}
