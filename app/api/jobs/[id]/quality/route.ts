import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { evaluateReleaseEvidence } from '../../../../../lib/build-plane/quality';
import type { BuildEvidence, QualityCheckKind, QualityCheckResult } from '../../../../../lib/build-plane/contracts';

export const dynamic = 'force-dynamic';

const kinds = new Set<QualityCheckKind>(['typecheck', 'lint', 'unit', 'integration', 'e2e', 'accessibility', 'visual']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [runsResult, evidenceResult, defectsResult] = await Promise.all([
    env.DB.prepare('SELECT id,kind,status,summary,duration_ms,started_at,completed_at FROM quality_runs WHERE job_id=? ORDER BY started_at DESC').bind(id).all(),
    env.DB.prepare('SELECT e.id,e.quality_run_id,e.artifact_id,e.claim,e.status,e.details_json,e.created_at FROM evidence e JOIN quality_runs q ON q.id=e.quality_run_id WHERE q.job_id=? ORDER BY e.created_at DESC').bind(id).all(),
    env.DB.prepare('SELECT id,quality_run_id,severity,status,title,details,created_at,resolved_at FROM defects WHERE job_id=? ORDER BY created_at DESC').bind(id).all(),
  ]);
  const runs = runsResult.results as Array<Record<string, unknown>>;
  const evidenceRows = evidenceResult.results as Array<Record<string, unknown>>;
  const checkResults: QualityCheckResult[] = runs.filter((run) => run.status !== 'running').map((run) => ({
    kind: run.kind as QualityCheckKind,
    status: run.status as 'passed' | 'failed' | 'skipped',
    durationMs: Number(run.duration_ms ?? 0),
    artifactIds: evidenceRows.filter((item) => item.quality_run_id === run.id && item.artifact_id).map((item) => String(item.artifact_id)),
    summary: String(run.summary ?? ''),
  }));
  const evidence: BuildEvidence[] = evidenceRows.map((item) => ({ id: String(item.id), checkKind: 'unit', claim: String(item.claim), status: item.status as BuildEvidence['status'], artifactIds: item.artifact_id ? [String(item.artifact_id)] : [], createdAt: Number(item.created_at) }));
  return NextResponse.json({ runs, evidence: evidenceRows, defects: defectsResult.results, gate: evaluateReleaseEvidence(checkResults, evidence) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { kind?: unknown; status?: unknown; summary?: unknown; durationMs?: unknown; artifactIds?: unknown; claim?: unknown; details?: unknown } | null;
  if (typeof input?.kind !== 'string' || !kinds.has(input.kind as QualityCheckKind)) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  if (input.status !== 'passed' && input.status !== 'failed' && input.status !== 'skipped') return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  const artifactIds = Array.isArray(input.artifactIds) ? input.artifactIds.filter((value): value is string => typeof value === 'string').slice(0, 20) : [];
  if (input.status === 'passed' && artifactIds.length === 0) return NextResponse.json({ error: 'passed_check_requires_artifact' }, { status: 400 });
  if (artifactIds.length) {
    const placeholders = artifactIds.map(() => '?').join(',');
    const found = await env.DB.prepare(`SELECT COUNT(*) AS count FROM artifacts WHERE job_id=? AND id IN (${placeholders})`).bind(id, ...artifactIds).first<{ count: number }>();
    if ((found?.count ?? 0) !== artifactIds.length) return NextResponse.json({ error: 'artifact_scope_mismatch' }, { status: 400 });
  }
  const now = Date.now();
  const runId = crypto.randomUUID();
  const summary = typeof input.summary === 'string' ? input.summary.slice(0, 2000) : '';
  const claim = typeof input.claim === 'string' ? input.claim.slice(0, 1000) : `${input.kind} ${input.status}`;
  const durationMs = typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0;
  const statements = [
    env.DB.prepare('INSERT INTO quality_runs (id,project_id,job_id,kind,status,summary,duration_ms,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(runId, access.job.project_id, id, input.kind, input.status, summary, durationMs, now - durationMs, now),
    ...artifactIds.map((artifactId) => env.DB.prepare('INSERT INTO evidence (id,quality_run_id,artifact_id,claim,status,details_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), runId, artifactId, claim, input.status === 'passed' ? 'verified' : 'failed', JSON.stringify(input.details ?? {}), now)),
  ];
  if (input.status === 'failed') statements.push(env.DB.prepare("INSERT INTO defects (id,project_id,job_id,quality_run_id,severity,status,title,details,created_at) VALUES (?,?,?,?,?,'open',?,?,?)").bind(crypto.randomUUID(), access.job.project_id, id, runId, input.kind === 'e2e' || input.kind === 'integration' ? 'high' : 'medium', `${input.kind} failed`, summary || claim, now));
  await env.DB.batch(statements);
  return NextResponse.json({ id: runId, kind: input.kind, status: input.status, artifactIds, completedAt: now }, { status: 201 });
}
