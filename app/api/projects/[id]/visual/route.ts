import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { validateDesignTokens, validateVisualSelection } from '../../../../../lib/visual/policy';
import { inspectVisualTarget } from '../../../../../lib/visual/client';

export const dynamic = 'force-dynamic';

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
  const input = await request.json().catch(() => null) as { action?: unknown; selector?: unknown; sourcePath?: unknown; sourceLine?: unknown; frozenPaths?: unknown; previewId?: unknown; cropArtifactId?: unknown; constraints?: unknown; sourceArtifactId?: unknown; tokens?: unknown; width?: unknown; height?: unknown; baselineSha256?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'inspect' && typeof input.selector === 'string' && typeof input.previewId === 'string') {
    if (!env.VISUAL_WORKER_URL || !env.VISUAL_CONTROL_TOKEN) return NextResponse.json({ error: 'visual_provider_not_configured' }, { status: 503 });
    const preview = await env.DB.prepare("SELECT id,url FROM preview_sessions WHERE id=? AND project_id=? AND status='ready' AND expires_at>?").bind(input.previewId, id, now).first<{ id: string; url: string }>();
    if (!preview?.url) return NextResponse.json({ error: 'ready_preview_required' }, { status: 409 });
    try {
      const inspection = await inspectVisualTarget(env.VISUAL_WORKER_URL, env.VISUAL_CONTROL_TOKEN, { organizationId: access.organizationId, projectId: id, requestId: crypto.randomUUID(), url: preview.url, selector: input.selector, width: typeof input.width === 'number' ? input.width : undefined, height: typeof input.height === 'number' ? input.height : undefined, baselineSha256: typeof input.baselineSha256 === 'string' ? input.baselineSha256 : undefined });
      const metadata = inspection.metadata as { source?: { path?: string | null; line?: number | null }; box?: unknown; styles?: unknown; domPath?: unknown } | undefined;
      const frozenPaths = Array.isArray(input.frozenPaths) ? input.frozenPaths.filter((value): value is string => typeof value === 'string') : [];
      const selection = validateVisualSelection({ selector: input.selector, sourcePath: metadata?.source?.path ?? undefined, sourceLine: metadata?.source?.line ?? undefined, frozenPaths });
      const selectionId = crypto.randomUUID();
      const screenshot = inspection.screenshot as { sha256?: unknown } | undefined;
      await env.DB.prepare('INSERT INTO visual_selections (id,project_id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(selectionId, id, input.previewId, input.selector, selection.sourcePath ?? null, selection.sourceLine ?? null, null, JSON.stringify({ viewport: inspection.viewport, box: metadata?.box, styles: metadata?.styles, domPath: metadata?.domPath, screenshotSha256: screenshot?.sha256 ?? null, visualDiff: inspection.visualDiff }), access.user.userId, now).run();
      return NextResponse.json({ id: selectionId, ...selection, inspection, patchExecution: selection.patchable ? 'patch_planner_ready' : 'blocked' }, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'visual_inspection_failed' }, { status: 502 });
    }
  }
  if (input?.action === 'select' && typeof input.selector === 'string') {
    let selection;
    try { selection = validateVisualSelection({ selector: input.selector, sourcePath: typeof input.sourcePath === 'string' ? input.sourcePath : undefined, sourceLine: typeof input.sourceLine === 'number' ? input.sourceLine : undefined, frozenPaths: Array.isArray(input.frozenPaths) ? input.frozenPaths.filter((value): value is string => typeof value === 'string') : [] }); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid_selection' }, { status: 400 }); }
    const selectionId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO visual_selections (id,project_id,preview_id,selector,source_path,source_line,crop_artifact_id,constraints_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(selectionId, id, typeof input.previewId === 'string' ? input.previewId : null, input.selector, selection.sourcePath ?? null, selection.sourceLine ?? null, typeof input.cropArtifactId === 'string' ? input.cropArtifactId : null, JSON.stringify(input.constraints ?? {}), access.user.userId, now).run();
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
