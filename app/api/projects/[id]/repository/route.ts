import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { buildRepositoryIndex } from '../../../../../lib/build-plane/repo-index';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const repository = await env.DB.prepare('SELECT id,provider,external_ref,default_branch,head_revision,created_at,updated_at FROM repositories WHERE project_id=?').bind(id).first<{ id: string }>();
  const files = repository ? await env.DB.prepare('SELECT path,sha256,byte_size,language,generated,indexed_at FROM repository_files WHERE repository_id=? ORDER BY path LIMIT 5000').bind(repository.id).all() : { results: [] };
  return NextResponse.json({ repository, files: files.results, truncated: files.results.length === 5000 });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { provider?: unknown; externalRef?: unknown; defaultBranch?: unknown; headRevision?: unknown; files?: unknown } | null;
  if (!input || typeof input.provider !== 'string' || !Array.isArray(input.files) || input.files.length > 5000) return NextResponse.json({ error: 'invalid_repository_index' }, { status: 400 });
  let files;
  try {
    files = buildRepositoryIndex(input.files.map((item) => {
      const file = item as Record<string, unknown>;
      if (typeof file.path !== 'string' || typeof file.byteSize !== 'number' || typeof file.sha256 !== 'string') throw new Error('invalid_file');
      return { path: file.path, byteSize: Math.max(0, Math.round(file.byteSize)), sha256: file.sha256 };
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_repository_index' }, { status: 400 });
  }
  const current = await env.DB.prepare('SELECT id FROM repositories WHERE project_id=?').bind(id).first<{ id: string }>();
  const repositoryId = current?.id ?? crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO repositories (id,project_id,provider,external_ref,default_branch,head_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET provider=excluded.provider,external_ref=excluded.external_ref,default_branch=excluded.default_branch,head_revision=excluded.head_revision,updated_at=excluded.updated_at").bind(repositoryId, id, input.provider.slice(0, 50), typeof input.externalRef === 'string' ? input.externalRef.slice(0, 500) : null, typeof input.defaultBranch === 'string' ? input.defaultBranch.slice(0, 200) : 'main', typeof input.headRevision === 'string' ? input.headRevision.slice(0, 200) : null, now, now),
    env.DB.prepare('DELETE FROM repository_files WHERE repository_id=?').bind(repositoryId),
  ]);
  for (let offset = 0; offset < files.length; offset += 100) {
    await env.DB.batch(files.slice(offset, offset + 100).map((file) => env.DB.prepare('INSERT INTO repository_files (repository_id,path,sha256,byte_size,language,generated,indexed_at) VALUES (?,?,?,?,?,?,?)').bind(repositoryId, file.path, file.sha256, file.byteSize, file.language, file.generated ? 1 : 0, now)));
  }
  return NextResponse.json({ id: repositoryId, filesIndexed: files.length, updatedAt: now });
}
