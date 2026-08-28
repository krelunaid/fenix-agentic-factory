import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { authorizeCreditUsage, type CreditEntry } from '../../../../../lib/billing/ledger';
import { validateIdempotencyKey } from '../../../../../lib/integrations/policy';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [account, entries] = await Promise.all([
    env.DB.prepare('SELECT id,provider,customer_ref,status,created_at,updated_at FROM billing_accounts WHERE organization_id=?').bind(access.organizationId).first(),
    env.DB.prepare('SELECT id,kind,credits,reference_type,reference_id,idempotency_key,created_at FROM credit_ledger WHERE organization_id=? ORDER BY created_at DESC LIMIT 500').bind(access.organizationId).all(),
  ]);
  const balance = (entries.results as Array<Record<string, unknown>>).reduce((sum, row) => sum + (row.kind === 'usage' ? -Number(row.credits) : Number(row.credits)), 0);
  return NextResponse.json({ account, balance, entries: entries.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; credits?: unknown; hardCap?: unknown; referenceType?: unknown; referenceId?: unknown; idempotencyKey?: unknown } | null;
  if (input?.action !== 'authorize-usage' || typeof input.credits !== 'number' || typeof input.hardCap !== 'number' || typeof input.referenceType !== 'string' || typeof input.referenceId !== 'string' || typeof input.idempotencyKey !== 'string') return NextResponse.json({ error: 'invalid_usage_request' }, { status: 400 });
  try { validateIdempotencyKey(input.idempotencyKey); } catch { return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 }); }
  const existing = await env.DB.prepare('SELECT id FROM credit_ledger WHERE idempotency_key=?').bind(input.idempotencyKey).first();
  if (existing) return NextResponse.json({ error: 'duplicate_usage_request' }, { status: 409 });
  const rows = await env.DB.prepare('SELECT kind,credits,idempotency_key FROM credit_ledger WHERE organization_id=?').bind(access.organizationId).all();
  const entries = (rows.results as Array<Record<string, unknown>>).map((row) => ({ kind: String(row.kind), credits: Number(row.credits), idempotencyKey: String(row.idempotency_key) })) as CreditEntry[];
  const authorization = authorizeCreditUsage(entries, input.credits, input.hardCap);
  if (!authorization.allowed) return NextResponse.json({ error: 'credit_hard_cap', ...authorization }, { status: 402 });
  const entryId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO credit_ledger (id,organization_id,project_id,kind,credits,reference_type,reference_id,idempotency_key,created_at) VALUES (?,?,?,'usage',?,?,?,?,?,?)").bind(entryId, access.organizationId, id, input.credits, input.referenceType.slice(0, 100), input.referenceId.slice(0, 200), input.idempotencyKey, now).run();
  return NextResponse.json({ id: entryId, authorized: true, remaining: authorization.remaining }, { status: 201 });
}
