import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const conversations = await env.DB.prepare('SELECT id,title,status,created_by,created_at,updated_at FROM conversations WHERE project_id=? ORDER BY updated_at DESC LIMIT 100').bind(id).all();
  const ids = (conversations.results as Array<{ id: string }>).map((row) => row.id);
  if (!ids.length) return NextResponse.json({ conversations: [], messages: [] });
  const placeholders = ids.map(() => '?').join(',');
  const messages = await env.DB.prepare(`SELECT id,conversation_id,role,content,status,metadata_json,created_at FROM messages WHERE conversation_id IN (${placeholders}) ORDER BY created_at`).bind(...ids).all();
  return NextResponse.json({ conversations: conversations.results, messages: messages.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const input = await request.json().catch(() => null) as { action?: unknown; title?: unknown; conversationId?: unknown; content?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'create') {
    const conversationId = crypto.randomUUID();
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 160) : 'Nuova conversazione';
    await env.DB.prepare("INSERT INTO conversations (id,project_id,title,status,created_by,created_at,updated_at) VALUES (?,?,?,'active',?,?,?)").bind(conversationId, id, title, access.user.userId, now, now).run();
    return NextResponse.json({ id: conversationId, title, status: 'active' }, { status: 201 });
  }
  if (input?.action === 'send' && typeof input.conversationId === 'string' && typeof input.content === 'string' && input.content.trim()) {
    const conversation = await env.DB.prepare("SELECT id FROM conversations WHERE id=? AND project_id=? AND status='active'").bind(input.conversationId, id).first();
    if (!conversation) return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 });
    const messageId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages (id,conversation_id,role,content,status,metadata_json,created_at) VALUES (?,?,'user',?,'complete','{}',?)").bind(messageId, input.conversationId, input.content.trim().slice(0, 20000), now),
      env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(now, input.conversationId),
    ]);
    return NextResponse.json({ id: messageId, role: 'user', status: 'complete', assistantExecution: 'ai_provider_required' }, { status: 201 });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
