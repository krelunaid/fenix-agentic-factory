import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (access.role !== 'owner' && access.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [health, backups, failures, costs] = await Promise.all([
    env.DB.prepare('SELECT provider,region,status,latency_ms,details_json,checked_at FROM provider_health ORDER BY checked_at DESC LIMIT 100').all(),
    env.DB.prepare('SELECT id,scope,artifact_id,status,started_at,completed_at,restore_tested_at FROM backup_runs WHERE organization_id=? OR organization_id IS NULL ORDER BY started_at DESC LIMIT 100').bind(access.organizationId).all(),
    env.DB.prepare("SELECT trace_id,type,severity,human_message,created_at FROM build_events WHERE project_id=? AND severity IN ('error','critical') ORDER BY created_at DESC LIMIT 100").bind(id).all(),
    env.DB.prepare('SELECT kind,SUM(units) AS units,SUM(amount) AS amount FROM usage_ledger WHERE organization_id=? AND project_id=? GROUP BY kind').bind(access.organizationId, id).all(),
  ]);
  return NextResponse.json({ providerHealth: health.results, backups: backups.results, recentFailures: failures.results, costsByKind: costs.results, slo: { availabilityTarget: 0.995, eventReplayTargetSeconds: 30, recoveryPointObjectiveHours: 24, recoveryTimeObjectiveHours: 4 }, runbooks: ['incident-response', 'provider-outage', 'backup-restore', 'credential-rotation'] });
}
