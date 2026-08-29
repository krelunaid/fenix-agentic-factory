import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { validateDesignTokens, validateVisualSelection } from '../../../../../lib/visual/policy';
import { inspectVisualTarget } from '../../../../../lib/visual/client';

export const dynamic = 'force-dynamic';

function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [selections, tokens] = await Promise.all([
    env.DB.prepare('SELECT id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at FROM visual_selections WHERE project_id=? ORDER BY created_at DESC LIMIT 200').bind(id).all(),
    env.DB.prepare('SELECT id,source_artifact_id,version,tokens_json,status,created_at FROM design_tokens WHERE project_id=? ORDER BY version DESC').bind(id).all(),
  ]);
  return NextResponse.json({ selections: selections.results, designTokens: tokens.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; selector?: unknown; sourcePath?: unknown; sourceLine?: unknown; frozenPaths?: unknown; previewId?: unknown; cropArtifactId?: unknown; constraints?: unknown; sourceArtifactId?: unknown; tokens?: unknown; width?: unknown; height?: unknown; baselineSha256?: unknown; baselineArtifactId?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'inspect' && typeof input.selector === 'string' && typeof input.previewId === 'string') {
    if (!env.VISUAL_WORKER_URL || !env.VISUAL_CONTROL_TOKEN) return NextResponse.json({ error: 'visual_provider_not_configured' }, { status: 503 });
    const preview = await env.DB.prepare("SELECT id,job_id,url FROM preview_sessions WHERE id=? AND project_id=? AND status='ready' AND expires_at>?").bind(input.previewId, id, now).first<{ id: string; job_id: string; url: string }>();
    if (!preview?.url) return NextResponse.json({ error: 'ready_preview_required' }, { status: 409 });
    const baseline = typeof input.baselineArtifactId === 'string' ? await env.DB.prepare("SELECT a.id,a.sha256,b.base64_data FROM artifacts a JOIN artifact_blobs b ON b.artifact_id=a.id WHERE a.id=? AND a.project_id=? AND a.media_type='image/png'").bind(input.baselineArtifactId, id).first<{ id: string; sha256: string; base64_data: string }>() : null;
    if (typeof input.baselineArtifactId === 'string' && !baseline) return NextResponse.json({ error: 'baseline_artifact_not_found' }, { status: 404 });
    try {
      const inspection = await inspectVisualTarget(env.VISUAL_WORKER_URL, env.VISUAL_CONTROL_TOKEN, { organizationId: access.organizationId, projectId: id, requestId: crypto.randomUUID(), url: preview.url, selector: input.selector, width: typeof input.width === 'number' ? input.width : undefined, height: typeof input.height === 'number' ? input.height : undefined, baselineSha256: baseline?.sha256 ?? (typeof input.baselineSha256 === 'string' ? input.baselineSha256 : undefined), baselineBase64: baseline?.base64_data });
      const metadata = inspection.metadata as { source?: { path?: string | null; line?: number | null }; box?: unknown; styles?: unknown; domPath?: unknown } | undefined;
      const frozenPaths = Array.isArray(input.frozenPaths) ? input.frozenPaths.filter((value): value is string => typeof value === 'string') : [];
      const selection = validateVisualSelection({ selector: input.selector, sourcePath: metadata?.source?.path ?? undefined, sourceLine: metadata?.source?.line ?? undefined, frozenPaths });
      const selectionId = crypto.randomUUID();
      const screenshot = inspection.screenshot as { mediaType?: unknown; base64?: unknown; sha256?: unknown } | undefined;
      const base64 = typeof screenshot?.base64 === 'string' ? screenshot.base64 : '';
      const decoded = base64 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64) ? Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)) : new Uint8Array();
      const persistable = decoded.byteLength > 0 && decoded.byteLength <= 750_000 && screenshot?.mediaType === 'image/png';
      const artifactId = persistable ? crypto.randomUUID() : null;
      const sha256 = persistable ? hex(await crypto.subtle.digest('SHA-256', decoded)) : (typeof screenshot?.sha256 === 'string' ? screenshot.sha256 : null);
      const statements = [
        env.DB.prepare('INSERT INTO visual_selections (id,project_id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(selectionId, id, input.previewId, input.selector, selection.sourcePath ?? null, selection.sourceLine ?? null, artifactId, JSON.stringify({ viewport: inspection.viewport, box: metadata?.box, styles: metadata?.styles, domPath: metadata?.domPath, screenshotSha256: sha256, baselineArtifactId: baseline?.id ?? null, visualDiff: inspection.visualDiff, frozenPaths }), access.user.userId, now),
      ];
      if (artifactId) {
        statements.push(
          env.DB.prepare('INSERT INTO artifacts (id,project_id,job_id,task_id,kind,storage_key,sha256,byte_size,media_type,created_at) VALUES (?,?,?,NULL,?,?,?,?,?,?)').bind(artifactId, id, preview.job_id, `${access.organizationId}/${id}/${preview.job_id}/visual/${artifactId}.png`, sha256, decoded.byteLength, 'image/png', now),
          env.DB.prepare('INSERT INTO artifact_blobs (artifact_id,base64_data,created_at) VALUES (?,?,?)').bind(artifactId, base64, now),
        );
      }
      await env.DB.batch(statements);
      return NextResponse.json({ id: selectionId, ...selection, inspection, cropArtifactId: artifactId, blobPersistence: artifactId ? 'd1_bounded' : 'size_or_format_rejected', patchExecution: selection.patchable ? 'patch_planner_ready' : 'blocked' }, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'visual_inspection_failed' }, { status: 502 });
    }
  }
  if (input?.action === 'select' && typeof input.selector === 'string') {
    let selection;
    try { selection = validateVisualSelection({ selector: input.selector, sourcePath: typeof input.sourcePath === 'string' ? input.sourcePath : undefined, sourceLine: typeof input.sourceLine === 'number' ? input.sourceLine : undefined, frozenPaths: Array.isArray(input.frozenPaths) ? input.frozenPaths.filter((value): value is string => typeof value === 'string') : [] }); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_selection' }, { status: 400 }); }
    const selectionId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO visual_selections (id,project_id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(selectionId, id, typeof input.previewId === 'string' ? input.previewId : null, input.selector, selection.sourcePath ?? null, selection.sourceLine ?? null, typeof input.cropArtifactId === 'string' ? input.cropArtifactId : null, JSON.stringify({ ...(input.constraints && typeof input.constraints === 'object' ? input.constraints : {}), frozenPaths: Array.isArray(input.frozenPaths) ? input.frozenPaths.filter((value): value is string => typeof value === 'string') : [] }), access.user.userId, now).run();
    return NextResponse.json({ id: selectionId, ...selection, patchExecution: selection.patchable ? 'patch_planner_required' : 'blocked' }, { status: 201 });
  }
  if (input?.action === 'save-tokens' && input.tokens && typeof input.tokens === 'object' && !Array.isArray(input.tokens)) {
    const verdict = validateDesignTokens(input.tokens as Record<string, unknown>);
    if (!verdict.valid) return NextResponse.json({ error: 'invalid_design_tokens', invalid: verdict.invalid }, { status: 400 });
    const current = await env.DB.prepare('SELECT COALESCE(MAX(version),0) AS version FROM design_tokens WHERE project_id=?').bind(id).first<{ version: number }>();
    const version = (current?.version ?? 0) + 1;
    const tokenId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO design_tokens (id,project_id,source_artifact_id,version,tokens_json,status,created_at) VALUES (?,?,?,?,?,'extracted',?)").bind(tokenId, id, typeof input.sourceArtifactId === 'string' ? input.sourceArtifactId : null, version, JSON.stringify(input.tokens), now).run();
    return NextResponse.json({ id: tokenId, version, status: 'extracted', next: 'human_review_required' }, { status: 201 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
