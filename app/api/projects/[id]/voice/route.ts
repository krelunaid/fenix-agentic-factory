import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { normalizeVoiceLanguage } from '../../../../../lib/voice/policy';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rows = await env.DB.prepare('SELECT id,conversation_id,language,status,transcript_json,audio_retention_opt_in,latency_ms,created_at,completed_at FROM voice_sessions WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return NextResponse.json({ sessions: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { language?: unknown; conversationId?: unknown; audioRetentionOptIn?: unknown; connectionId?: unknown } | null;
  if (typeof input?.language !== 'string' || typeof input.connectionId !== 'string') return NextResponse.json({ error: 'invalid_voice_request' }, { status: 400 });
  let language: 'it' | 'en';
  try { language = normalizeVoiceLanguage(input.language); } catch { return NextResponse.json({ error: 'unsupported_voice_language' }, { status: 400 }); }
  const connection = await env.DB.prepare("SELECT id FROM provider_connections WHERE id=? AND organization_id=? AND kind='voice' AND status='healthy'").bind(input.connectionId, access.organizationId).first();
  if (!connection) return NextResponse.json({ error: 'voice_provider_not_ready', fallback: 'text' }, { status: 503 });
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO voice_sessions (id,project_id,conversation_id,language,status,transcript_json,audio_retention_opt_in,created_at) VALUES (?,?,?,?,'starting','[]',?,?)").bind(sessionId, id, typeof input.conversationId === 'string' ? input.conversationId : null, language, input.audioRetentionOptIn === true ? 1 : 0, now).run();
  return NextResponse.json({ id: sessionId, status: 'starting', audioRetention: input.audioRetentionOptIn === true ? 'opted_in' : 'discard', execution: 'streaming_provider_required' }, { status: 202 });
}
