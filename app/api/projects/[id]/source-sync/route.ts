import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { validatePushPlan } from '../../../../../lib/source-control/policy';
import { pushFilesToGitHub } from '../../../../../lib/source-control/github';
import { decryptSecret } from '../../../../../lib/secret-broker';
import { parseExportableSourceBundle } from '../../../../../lib/source-export';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT s.id,s.direction,s.branch,s.base_revision,s.head_revision,s.status,s.conflict_json,s.created_at,s.completed_at FROM repository_syncs s JOIN repositories r ON r.id=s.repository_id WHERE r.project_id=? ORDER BY s.created_at DESC').bind(id).all();
  return NextResponse.json({ syncs: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { connectionId?: unknown; direction?: unknown; branch?: unknown; force?: unknown; files?: unknown; protectedBranches?: unknown; baseRevision?: unknown } | null;
  if (!input || typeof input.connectionId !== 'string' || !['import', 'push', 'pull'].includes(String(input.direction))) return NextResponse.json({ error: 'invalid_sync_request' }, { status: 400 });
  const connection = await env.DB.prepare("SELECT sc.id,sc.provider,s.id AS secret_id,s.ciphertext,s.iv FROM source_connections sc JOIN provider_connections pc ON pc.id=sc.id AND pc.organization_id=sc.organization_id AND pc.project_id=? AND pc.kind='source' AND pc.status='healthy' JOIN secret_records s ON s.id=substr(sc.secret_ref,10) AND s.organization_id=sc.organization_id AND s.revoked_at IS NULL WHERE sc.id=? AND sc.organization_id=? AND sc.status='active'").bind(id, input.connectionId, access.organizationId).first<{ id: string; provider: string; secret_id: string; ciphertext: string; iv: string }>();
  if (!connection) return NextResponse.json({ error: 'source_connection_not_active' }, { status: 503 });
  const repository = await env.DB.prepare('SELECT id,external_ref FROM repositories WHERE project_id=?').bind(id).first<{ id: string; external_ref: string | null }>();
  if (!repository) return NextResponse.json({ error: 'repository_not_indexed' }, { status: 409 });
  const sourceArtifact = input.direction === 'push' ? await env.DB.prepare("SELECT b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.project_id=? AND a.kind='generated_source_bundle' ORDER BY a.created_at DESC LIMIT 1").bind(id).first<{ base64_data: string }>() : null;
  let sourceFiles: Array<{ path: string; content: string }> = [];
  if (input.direction === 'push') {
    if (!sourceArtifact) return NextResponse.json({ error: 'generated_source_bundle_required' }, { status: 409 });
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(sourceArtifact.base64_data), (character) => character.charCodeAt(0)));
      sourceFiles = parseExportableSourceBundle(JSON.parse(decoded) as unknown);
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'generated_source_bundle_invalid' }, { status: 409 }); }
  }
  let plan;
  try {
    plan = validatePushPlan({ branch: typeof input.branch === 'string' ? input.branch : 'fenix/change', force: input.force === true, files: input.direction === 'push' ? sourceFiles.map((file) => file.path) : Array.isArray(input.files) ? input.files.filter((value): value is string => typeof value === 'string') : [], protectedBranches: Array.isArray(input.protectedBranches) ? input.protectedBranches.filter((value): value is string => typeof value === 'string') : ['main'] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_push_plan' }, { status: 400 });
  }
  if (input.direction === 'push' && connection.provider.toLowerCase() !== 'github') return NextResponse.json({ error: 'source_push_adapter_not_available', provider: connection.provider }, { status: 422 });
  if (input.direction === 'push' && !repository.external_ref) return NextResponse.json({ error: 'github_repository_ref_required' }, { status: 409 });
  if (input.direction === 'push' && !env.CREDENTIALS_MASTER_KEY) return NextResponse.json({ error: 'secret_broker_not_configured' }, { status: 503 });
  const syncId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO repository_syncs (id,repository_id,connection_id,direction,branch,base_revision,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)").bind(syncId, repository.id, input.connectionId, input.direction, plan.branch, typeof input.baseRevision === 'string' ? input.baseRevision : null, now).run();
  if (input.direction !== 'push') return NextResponse.json({ id: syncId, status: 'pending', plan, execution: 'provider_worker_required' }, { status: 202 });
  await env.DB.prepare("UPDATE repository_syncs SET status='running' WHERE id=? AND repository_id=?").bind(syncId, repository.id).run();
  try {
    const token = await decryptSecret(env.CREDENTIALS_MASTER_KEY!, connection.ciphertext, connection.iv, `${access.organizationId}:${id}:${connection.secret_id}`);
    const result = await pushFilesToGitHub({ token, repository: repository.external_ref!, branch: plan.branch, files: sourceFiles, baseRevision: typeof input.baseRevision === 'string' ? input.baseRevision : undefined, message: `FENIX verified source ${new Date(now).toISOString()}` });
    const completedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE repository_syncs SET status='completed',head_revision=?,completed_at=? WHERE id=? AND repository_id=?").bind(result.headRevision, completedAt, syncId, repository.id),
      env.DB.prepare('UPDATE repositories SET provider=?,head_revision=?,updated_at=? WHERE id=?').bind('github', result.headRevision, completedAt, repository.id),
      env.DB.prepare('INSERT INTO audit_events (id,organization_id,actor_user_id,action,resource_type,resource_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), access.organizationId, access.user.userId, 'source.push', 'repository_sync', syncId, JSON.stringify({ repository: repository.external_ref, branch: plan.branch, baseRevision: result.baseRevision, headRevision: result.headRevision, filesPushed: result.filesPushed }), completedAt),
    ]);
    return NextResponse.json({ id: syncId, status: 'completed', plan, ...result }, { status: 201 });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'source_push_failed';
    await env.DB.prepare("UPDATE repository_syncs SET status='failed',conflict_json=?,completed_at=? WHERE id=? AND repository_id=?").bind(JSON.stringify({ error: errorCode }), Date.now(), syncId, repository.id).run();
    return NextResponse.json({ error: errorCode, id: syncId }, { status: errorCode === 'source_revision_conflict' ? 409 : 502 });
  }
}
