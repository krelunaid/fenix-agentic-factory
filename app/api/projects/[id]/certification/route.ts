import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';
import { evaluateBetaCertification, type CertificationResult } from '../../../../../lib/hardening/certification';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare("SELECT id,scenario,run_number,status,evidence_json,blocker,created_at FROM certification_runs WHERE json_extract(evidence_json,'$.projectId')=? OR blocker LIKE ? ORDER BY scenario,run_number").bind(id, `project:${id}:%`).all();
  const results: CertificationResult[] = (rows.results as Array<Record<string, unknown>>).map((row) => {
    const data = JSON.parse(String(row.evidence_json || '{}')) as { artifactIds?: string[] };
    return { scenario: String(row.scenario), runNumber: Number(row.run_number), status: row.status as CertificationResult['status'], evidenceIds: data.artifactIds ?? [], blocker: row.blocker ? String(row.blocker) : undefined };
  });
  return NextResponse.json({ runs: rows.results, verdict: evaluateBetaCertification(results) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (access.role !== 'owner' && access.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { scenario?: unknown; runNumber?: unknown; status?: unknown; artifactIds?: unknown; blocker?: unknown } | null;
  if (typeof input?.scenario !== 'string' || !/^C(?:[1-9]|1[0-5])$/.test(input.scenario) || ![1, 2, 3].includes(Number(input.runNumber)) || !['passed', 'failed', 'blocked'].includes(String(input.status))) return NextResponse.json({ error: 'invalid_certification_result' }, { status: 400 });
  const artifactIds = Array.isArray(input.artifactIds) ? input.artifactIds.filter((value): value is string => typeof value === 'string') : [];
  if (input.status === 'passed' && artifactIds.length === 0) return NextResponse.json({ error: 'passed_run_requires_evidence' }, { status: 400 });
  if (artifactIds.length) {
    const placeholders = artifactIds.map(() => '?').join(',');
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM artifacts WHERE project_id=? AND id IN (${placeholders})`).bind(id, ...artifactIds).first<{ count: number }>();
    if ((count?.count ?? 0) !== artifactIds.length) return NextResponse.json({ error: 'evidence_scope_mismatch' }, { status: 400 });
  }
  const runId = crypto.randomUUID();
  const now = Date.now();
  const evidence = JSON.stringify({ projectId: id, artifactIds });
  await env.DB.prepare('INSERT INTO certification_runs (id,scenario,run_number,status,evidence_json,blocker,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(scenario,run_number) DO UPDATE SET status=excluded.status,evidence_json=excluded.evidence_json,blocker=excluded.blocker,created_at=excluded.created_at').bind(runId, input.scenario, input.runNumber, input.status, evidence, typeof input.blocker === 'string' ? `project:${id}:${input.blocker.slice(0, 1000)}` : null, now).run();
  return NextResponse.json({ id: runId, scenario: input.scenario, runNumber: input.runNumber, status: input.status }, { status: 201 });
}
