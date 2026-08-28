import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { createMobileCompatibilityPlan } from '../../../../../lib/mobile/policy';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [profile, builds] = await Promise.all([
    env.DB.prepare('SELECT id,platform_json,permissions_json,bundle_identifier,status,created_at,updated_at FROM mobile_profiles WHERE project_id=?').bind(id).first(),
    env.DB.prepare('SELECT id,profile_id,artifact_id,platform,channel,provider_ref,status,qr_url,created_at,completed_at FROM mobile_builds WHERE project_id=? ORDER BY created_at DESC').bind(id).all(),
  ]);
  return NextResponse.json({ profile, builds: builds.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; bundleIdentifier?: unknown; platforms?: unknown; permissions?: unknown; webCapabilities?: unknown; nativeImplementations?: unknown; platform?: unknown; channel?: unknown; connectionId?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'save-profile' && typeof input.bundleIdentifier === 'string') {
    if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_-]+){2,}$/.test(input.bundleIdentifier)) return NextResponse.json({ error: 'invalid_bundle_identifier' }, { status: 400 });
    const platforms = Array.isArray(input.platforms) ? input.platforms.filter((value) => value === 'ios' || value === 'android') : ['ios', 'android'];
    const permissions = Array.isArray(input.permissions) ? input.permissions.filter((value): value is string => typeof value === 'string').slice(0, 30) : [];
    const plan = createMobileCompatibilityPlan(Array.isArray(input.webCapabilities) ? input.webCapabilities.filter((value): value is string => typeof value === 'string') : [], input.nativeImplementations && typeof input.nativeImplementations === 'object' ? input.nativeImplementations as Record<string, string> : {});
    const current = await env.DB.prepare('SELECT id FROM mobile_profiles WHERE project_id=?').bind(id).first<{ id: string }>();
    const profileId = current?.id ?? crypto.randomUUID();
    await env.DB.prepare("INSERT INTO mobile_profiles (id,project_id,platform_json,permissions_json,bundle_identifier,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET platform_json=excluded.platform_json,permissions_json=excluded.permissions_json,bundle_identifier=excluded.bundle_identifier,status=excluded.status,updated_at=excluded.updated_at")
      .bind(profileId, id, JSON.stringify(platforms), JSON.stringify(permissions), input.bundleIdentifier, plan.compatible ? 'ready' : 'invalid', now, now).run();
    return NextResponse.json({ id: profileId, status: plan.compatible ? 'ready' : 'invalid', compatibility: plan }, { status: current ? 200 : 201 });
  }
  if (input?.action === 'plan-build' && (input.platform === 'ios' || input.platform === 'android') && ['development', 'preview', 'production'].includes(String(input.channel)) && typeof input.connectionId === 'string') {
    const profile = await env.DB.prepare("SELECT id FROM mobile_profiles WHERE project_id=? AND status='ready'").bind(id).first<{ id: string }>();
    const connection = await env.DB.prepare("SELECT id FROM provider_connections WHERE id=? AND organization_id=? AND kind='mobile_build' AND status='healthy'").bind(input.connectionId, access.organizationId).first();
    if (!profile || !connection) return NextResponse.json({ error: 'mobile_profile_or_provider_not_ready' }, { status: 503 });
    const buildId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO mobile_builds (id,project_id,profile_id,platform,channel,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(buildId, id, profile.id, input.platform, input.channel, now).run();
    return NextResponse.json({ id: buildId, status: 'pending', execution: 'native_build_provider_required' }, { status: 202 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
