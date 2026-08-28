import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { normalizeVoiceLanguage } from '../../../../../lib/voice/policy';
import { invokeManagedVoice } from '../../../../../lib/ai-gateway/client';

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
  const input = await request.json().catch(() => null) as { action?: unknown; language?: unknown; conversationId?: unknown; audioRetentionOptIn?: unknown; connectionId?: unknown; sessionId?: unknown; audio?: unknown; text?: unknown } | null;
  if (typeof input?.language !== 'string') return NextResponse.json({ error: 'invalid_voice_request' }, { status: 400 });
  let language: 'it' | 'en';
  try { language = normalizeVoiceLanguage(input.language); } catch { return NextResponse.json({ error: 'unsupported_voice_language' }, { status: 400 }); }
  const managed = Boolean(env.AI_WORKER_URL && env.AI_CONTROL_TOKEN);
  const connection = managed ? { id: 'managed' } : typeof input.connectionId === 'string' ? await env.DB.prepare("SELECT id FROM provider_connections WHERE id=? AND organization_id=? AND kind='voice' AND status='healthy'").bind(input.connectionId, access.organizationId).first() : null;
  if (!connection) return NextResponse.json({ error: 'voice_provider_not_ready', fallback: 'text' }, { status: 503 });
  if ((input.action === 'transcribe' || input.action === 'synthesize') && managed) {
    const requestedAudio = Array.isArray(input.audio) ? input.audio.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 255) : [];
    if (input.action === 'transcribe' && (!requestedAudio.length || requestedAudio.length > 10_000_000)) return NextResponse.json({ error: 'invalid_audio' }, { status: 400 });
    if (input.action === 'synthesize' && (typeof input.text !== 'string' || !input.text.trim())) return NextResponse.json({ error: 'invalid_tts_text' }, { status: 400 });
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : crypto.randomUUID();
    const startedAt = Date.now();
    if (typeof input.sessionId === 'string') {
      const session = await env.DB.prepare('SELECT id FROM voice_sessions WHERE id=? AND project_id=?').bind(sessionId, id).first();
      if (!session) return NextResponse.json({ error: 'voice_session_not_found' }, { status: 404 });
    } else {
      await env.DB.prepare("INSERT INTO voice_sessions (id,project_id,conversation_id,language,status,transcript_json,audio_retention_opt_in,created_at) VALUES (?,?,?,?,'active','[]',?,?)").bind(sessionId, id, typeof input.conversationId === 'string' ? input.conversationId : null, language, input.audioRetentionOptIn === true ? 1 : 0, startedAt).run();
    }
    try {
      if (input.action === 'transcribe') {
        const response = await invokeManagedVoice(env.AI_WORKER_URL!, env.AI_CONTROL_TOKEN!, 'stt', { organizationId: access.organizationId, projectId: id, requestId: sessionId, audio: requestedAudio, language });
        const transcript = String((response.result as { text?: unknown } | undefined)?.text ?? '');
        const completedAt = Date.now();
        await env.DB.prepare("UPDATE voice_sessions SET status='completed',transcript_json=?,latency_ms=?,completed_at=? WHERE id=? AND project_id=?").bind(JSON.stringify([{ role: 'user', text: transcript, at: completedAt }]), completedAt - startedAt, completedAt, sessionId, id).run();
        return NextResponse.json({ id: sessionId, status: 'completed', transcript, audioStored: false, latencyMs: completedAt - startedAt });
      }
      const response = await invokeManagedVoice(env.AI_WORKER_URL!, env.AI_CONTROL_TOKEN!, 'tts', { organizationId: access.organizationId, projectId: id, requestId: sessionId, text: String(input.text).slice(0, 5_000), language });
      const completedAt = Date.now();
      await env.DB.prepare("UPDATE voice_sessions SET status='completed',latency_ms=?,completed_at=? WHERE id=? AND project_id=?").bind(completedAt - startedAt, completedAt, sessionId, id).run();
      return NextResponse.json({ id: sessionId, status: 'completed', audio: (response.result as { audio?: unknown } | undefined)?.audio ?? response.result, mediaType: 'audio/mpeg', audioStored: false, latencyMs: completedAt - startedAt });
    } catch (error) {
      await env.DB.prepare("UPDATE voice_sessions SET status='failed',completed_at=? WHERE id=? AND project_id=?").bind(Date.now(), sessionId, id).run();
      return NextResponse.json({ error: error instanceof Error ? error.message : 'voice_provider_failed', fallback: 'text' }, { status: 502 });
    }
  }
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO voice_sessions (id,project_id,conversation_id,language,status,transcript_json,audio_retention_opt_in,created_at) VALUES (?,?,?,?,'starting','[]',?,?)").bind(sessionId, id, typeof input.conversationId === 'string' ? input.conversationId : null, language, input.audioRetentionOptIn === true ? 1 : 0, now).run();
  return NextResponse.json({ id: sessionId, status: 'starting', audioRetention: input.audioRetentionOptIn === true ? 'opted_in_metadata_only' : 'discard', execution: managed ? 'managed_voice_ready' : 'streaming_provider_required' }, { status: 202 });
}
