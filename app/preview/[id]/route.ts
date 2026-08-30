import { env } from 'cloudflare:workers';
import { buildSeedRows, type ProductBrief } from '../../../lib/build-plane/agentic-generator';
import { buildDurablePreviewHtml, decodePreviewBundle, refreshPreviewBundle } from '../../../lib/build-plane/durable-preview';
import { requireProjectAccess } from '../../../lib/core-access';
import { ensureCoreSchema } from '../../../db';

export const dynamic = 'force-dynamic';

type BundleRow = { id: string; base64_data: string };
type ProjectRow = { name: string; description: string };

const corsHeaders = {
  'access-control-allow-origin': 'null',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  vary: 'Origin',
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

async function latestBundle(projectId: string) {
  return env.DB.prepare(
    "SELECT a.id,b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.project_id=? AND a.kind='generated_source_bundle' ORDER BY a.created_at DESC LIMIT 1",
  ).bind(projectId).first<BundleRow>();
}

async function effectiveBundle(projectId: string, row: BundleRow) {
  const project = await env.DB.prepare(
    'SELECT name,description FROM projects WHERE id=? LIMIT 1',
  ).bind(projectId).first<ProjectRow>();
  const decoded = decodePreviewBundle(row.base64_data);
  return project ? refreshPreviewBundle(decoded, project) : decoded;
}

async function previewToken(projectId: string, artifactId: string) {
  const secret = env.SANDBOX_CONTROL_TOKEN || env.AI_CONTROL_TOKEN;
  if (!secret) throw new Error('preview_signing_unavailable');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${projectId}:${artifactId}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authorizeApi(request: Request, projectId: string) {
  const bundle = await latestBundle(projectId);
  if (!bundle) return null;
  const expected = await previewToken(projectId, bundle.id);
  const supplied = new URL(request.url).searchParams.get('token');
  return supplied === expected ? { row: bundle, bundle: await effectiveBundle(projectId, bundle) } : null;
}

async function ensureSeed(projectId: string, brief: ProductBrief) {
  await ensureCoreSchema();
  const existing = await env.DB.prepare(
    'SELECT payload_json FROM prototype_records WHERE project_id=? LIMIT 1',
  ).bind(projectId).first<{ payload_json: string }>();
  let schemaMatches = false;
  if (existing) {
    try {
      const payload = JSON.parse(existing.payload_json) as Record<string, unknown>;
      schemaMatches = brief.entity.fields.every((field) => field.key in payload);
    } catch {}
  }
  if (schemaMatches) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM prototype_records WHERE project_id=?').bind(projectId),
    ...buildSeedRows(brief).map((payload) =>
      env.DB.prepare(
        'INSERT INTO prototype_records (id,project_id,payload_json,created_at,updated_at) VALUES (?,?,?,?,?)',
      ).bind(crypto.randomUUID(), projectId, JSON.stringify(payload), now, now),
    ),
  ]);
}

async function handleApi(request: Request, projectId: string) {
  const authorized = await authorizeApi(request, projectId);
  if (!authorized) return json({ error: 'preview_unauthorized' }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get('api');
  const brief = authorized.bundle.productBrief;
  await ensureSeed(projectId, brief);
  if (action === 'session') {
    return json({ user: { email: 'demo@fenix.app', role: 'admin', demo: true } });
  }
  if (action === 'metrics') {
    const total = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM prototype_records WHERE project_id=?',
    ).bind(projectId).first<{ total: number }>();
    return json({
      total: total?.total ?? 0,
      active: Math.max(1, Math.ceil((total?.total ?? 0) * 0.75)),
      workflows: brief.workflows.length,
    });
  }
  if (action === 'items' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id,payload_json,created_at,updated_at FROM prototype_records WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
    ).bind(projectId).all<{ id: string; payload_json: string; created_at: number; updated_at: number }>();
    return json({
      items: rows.results.map((row) => ({
        id: row.id,
        ...JSON.parse(row.payload_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }
  if ((action === 'items' || action === 'contact') && request.method === 'POST') {
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input) return json({ error: 'invalid_body' }, 400);
    const payload: Record<string, string | number> = {};
    for (const field of brief.entity.fields) {
      const value = input[field.key];
      if (field.required && (value === undefined || value === '')) {
        return json({ error: 'required_field', field: field.key }, 400);
      }
      payload[field.key] = field.type === 'number'
        ? Number(value)
        : String(value ?? '').slice(0, field.key === 'message' ? 2_000 : 240);
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO prototype_records (id,project_id,payload_json,created_at,updated_at) VALUES (?,?,?,?,?)',
    ).bind(id, projectId, JSON.stringify(payload), now, now).run();
    return json(action === 'contact' ? { id, ok: true } : { id, ...payload, createdAt: now, updatedAt: now }, 201);
  }
  if (action === 'items' && request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'record_required' }, 400);
    await env.DB.prepare(
      'DELETE FROM prototype_records WHERE id=? AND project_id=?',
    ).bind(id, projectId).run();
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (new URL(request.url).searchParams.has('api')) return handleApi(request, id);
  const access = await requireProjectAccess(id);
  if (!access) return new Response('Not found', { status: 404 });
  const row = await latestBundle(id);
  if (!row) return new Response('La preview permanente non è ancora pronta.', { status: 425 });
  const token = await previewToken(id, row.id);
  const endpoint = `/preview/${encodeURIComponent(id)}?token=${token}`;
  const html = buildDurablePreviewHtml(await effectiveBundle(id, row), endpoint);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https: http:; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, (await context.params).id);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, (await context.params).id);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
