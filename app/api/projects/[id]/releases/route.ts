import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { evaluateReleaseGate } from '../../../../../lib/deploy/release-policy';

export const dynamic = 'force-dynamic';
const requiredChecks = ['typecheck', 'lint', 'unit', 'integration', 'e2e', 'accessibility'];

async function qualityGate(jobId: string) {
  const results = await Promise.all(requiredChecks.map((kind) => env.DB.prepare("SELECT q.id,q.status,(SELECT COUNT(*) FROM evidence e WHERE e.quality_run_id=q.id AND e.status='verified' AND e.artifact_id IS NOT NULL) AS evidence_count FROM quality_runs q WHERE q.job_id=? AND q.kind=? ORDER BY q.started_at DESC LIMIT 1").bind(jobId, kind).first<{ status: string; evidence_count: number }>()));
  return { releasable: results.every((result) => result?.status === 'passed' && (result.evidence_count ?? 0) > 0), checks: requiredChecks.map((kind, index) => ({ kind, status: results[index]?.status ?? 'missing', evidence: results[index]?.evidence_count ?? 0 })) };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const releases = await env.DB.prepare('SELECT id,job_id,artifact_id,version,status,created_by,created_at FROM releases WHERE project_id=? ORDER BY created_at DESC').bind(id).all();
  const deployments = await env.DB.prepare('SELECT d.id,d.release_id,d.environment,d.provider_ref,d.url,d.status,d.health_json,d.created_at,d.completed_at FROM deployment_records d JOIN releases r ON r.id=d.release_id WHERE r.project_id=? ORDER BY d.created_at DESC').bind(id).all();
  return NextResponse.json({ releases: releases.results, deployments: deployments.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; jobId?: unknown; artifactId?: unknown; version?: unknown; releaseId?: unknown; connectionId?: unknown; environment?: unknown; smokePassed?: unknown; approvalId?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'create-candidate' && typeof input.jobId === 'string' && typeof input.artifactId === 'string' && typeof input.version === 'string') {
    if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(input.version)) return NextResponse.json({ error: 'invalid_release_version' }, { status: 400 });
    const artifact = await env.DB.prepare("SELECT id,sha256 FROM artifacts WHERE id=? AND project_id=? AND job_id=? AND kind='source_bundle'").bind(input.artifactId, id, input.jobId).first<{ id: string; sha256: string }>();
    if (!artifact) return NextResponse.json({ error: 'source_bundle_required' }, { status: 400 });
    const gate = await qualityGate(input.jobId);
    if (!gate.releasable) return NextResponse.json({ error: 'quality_gate_failed', checks: gate.checks }, { status: 409 });
    const releaseId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO releases (id,project_id,job_id,artifact_id,version,status,created_by,created_at) VALUES (?,?,?,?,?,'candidate',?,?)").bind(releaseId, id, input.jobId, input.artifactId, input.version, access.user.userId, now).run();
    return NextResponse.json({ id: releaseId, version: input.version, artifactSha256: artifact.sha256, status: 'candidate' }, { status: 201 });
  }
  if (input?.action === 'plan-deploy' && typeof input.releaseId === 'string' && typeof input.connectionId === 'string' && ['preview', 'staging', 'production'].includes(String(input.environment))) {
    const release = await env.DB.prepare('SELECT r.id,r.job_id,a.sha256 FROM releases r JOIN artifacts a ON a.id=r.artifact_id WHERE r.id=? AND r.project_id=?').bind(input.releaseId, id).first<{ id: string; job_id: string; sha256: string }>();
    const connection = await env.DB.prepare("SELECT id FROM provider_connections WHERE id=? AND organization_id=? AND kind='deploy' AND status='healthy'").bind(input.connectionId, access.organizationId).first();
    if (!release || !connection) return NextResponse.json({ error: 'release_or_deploy_connection_not_ready' }, { status: 503 });
    const gate = await qualityGate(release.job_id);
    let approvalStatus: 'approved' | 'pending' = 'pending';
    if (typeof input.approvalId === 'string') {
      const approval = await env.DB.prepare("SELECT status FROM approvals WHERE id=? AND project_id=? AND kind='production'").bind(input.approvalId, id).first<{ status: string }>();
      if (approval?.status === 'approved') approvalStatus = 'approved';
    }
    const previous = await env.DB.prepare("SELECT d.release_id FROM deployment_records d JOIN releases r ON r.id=d.release_id WHERE r.project_id=? AND d.environment='production' AND d.status='ready' ORDER BY d.completed_at DESC LIMIT 1").bind(id).first<{ release_id: string }>();
    const verdict = evaluateReleaseGate({ environment: input.environment as 'preview' | 'staging' | 'production', artifactSha256: release.sha256, qualityReleasable: gate.releasable, smokePassed: input.smokePassed === true, approvalStatus, previousProductionReleaseId: previous?.release_id });
    if (!verdict.allowed) return NextResponse.json({ error: 'release_gate_failed', reasons: verdict.reasons }, { status: 409 });
    const deploymentId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO deployment_records (id,release_id,connection_id,environment,status,health_json,created_at) VALUES (?,?,?,?,'pending','{}',?)").bind(deploymentId, release.id, input.connectionId, input.environment, now).run();
    return NextResponse.json({ id: deploymentId, status: 'pending', execution: 'deploy_provider_worker_required', rollbackReleaseId: previous?.release_id ?? null }, { status: 202 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
