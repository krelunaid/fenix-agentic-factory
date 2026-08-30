import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

const allowedKinds = new Set(['source_bundle', 'generated_source_bundle', 'provenance', 'build_log', 'test_report', 'screenshot', 'visual_crop', 'trace', 'snapshot', 'patch_snapshot', 'project_snapshot']);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const artifactId = new URL(request.url).searchParams.get('artifactId');
  if (artifactId) {
    const row = await env.DB.prepare('SELECT a.media_type,a.sha256,a.byte_size,b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.id=? AND a.job_id=?').bind(artifactId, id).first<{ media_type: string; sha256: string; byte_size: number; base64_data: string }>();
    if (!row) return NextResponse.json({ error: 'artifact_blob_not_found' }, { status: 404 });
    const decoded = Uint8Array.from(atob(row.base64_data), (character) => character.charCodeAt(0));
    return new Response(decoded, { headers: { 'content-type': row.media_type, 'content-length': String(row.byte_size), 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff', 'etag': `\"${row.sha256}\"`, 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  const rows = await env.DB.prepare('SELECT id,task_id,kind,storage_key,sha256,byte_size,media_type,created_at FROM artifacts WHERE job_id=? ORDER BY created_at DESC').bind(id).all();
  return NextResponse.json({ artifacts: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.kind !== 'string' || !allowedKinds.has(input.kind) || typeof input.storageKey !== 'string' || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256) || typeof input.byteSize !== 'number' || input.byteSize < 0 || typeof input.mediaType !== 'string') {
    return NextResponse.json({ error: 'invalid_artifact' }, { status: 400 });
  }
  const expectedPrefix = `${access.job.organization_id}/${access.job.project_id}/${id}/`;
  if (!input.storageKey.startsWith(expectedPrefix)) return NextResponse.json({ error: 'artifact_scope_mismatch' }, { status: 400 });
  const artifactId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO artifacts (id,project_id,job_id,task_id,kind,storage_key,sha256,byte_size,media_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(artifactId, access.job.project_id, id, typeof input.taskId === 'string' ? input.taskId : null, input.kind, input.storageKey, input.sha256, Math.round(input.byteSize), input.mediaType.slice(0, 200), now).run();
  return NextResponse.json({ id: artifactId, createdAt: now }, { status: 201 });
}
