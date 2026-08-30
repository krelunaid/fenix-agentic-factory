import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';
import { createSourceTar, parseExportableSourceBundle, sourceArchiveName } from '../../../../../lib/source-export';
import { offlineProvenanceVerifier } from '../../../../../lib/provenance';

export const dynamic = 'force-dynamic';

function decodeBase64(value: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const project = await env.DB.prepare('SELECT name FROM projects WHERE id=?').bind(id).first<{ name: string }>();
  const [artifact, provenance] = await Promise.all([
    env.DB.prepare("SELECT a.id,a.sha256,a.created_at,b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.project_id=? AND a.kind='generated_source_bundle' ORDER BY a.created_at DESC LIMIT 1").bind(id).first<{ id: string; sha256: string; created_at: number; base64_data: string }>(),
    env.DB.prepare("SELECT a.id,a.sha256,b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.project_id=? AND a.kind='provenance' ORDER BY a.created_at DESC LIMIT 1").bind(id).first<{ id: string; sha256: string; base64_data: string }>(),
  ]);
  if (!project || !artifact) return NextResponse.json({ error: 'source_snapshot_not_found' }, { status: 404 });
  try {
    const files = parseExportableSourceBundle(JSON.parse(decodeBase64(artifact.base64_data)) as unknown);
    if (provenance) files.push({ path: '.fenix/provenance.json', content: decodeBase64(provenance.base64_data) }, { path: '.fenix/verify.mjs', content: offlineProvenanceVerifier });
    const archive = createSourceTar(files, project.name, artifact.created_at);
    return new Response(archive.buffer as ArrayBuffer, {
      headers: {
        'content-type': 'application/x-tar',
        'content-disposition': `attachment; filename="${sourceArchiveName(project.name)}"`,
        'content-length': String(archive.byteLength),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-fenix-artifact-id': artifact.id,
        'x-fenix-source-revision': artifact.sha256,
        ...(provenance ? { 'x-fenix-provenance-id': provenance.id, 'x-fenix-provenance-sha256': provenance.sha256 } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'source_export_failed' }, { status: 409 });
  }
}
