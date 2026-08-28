import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '../../../../../lib/core-access';
import { invokeManagedAI } from '../../../../../lib/ai-gateway/client';

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
    if (!env.AI_WORKER_URL || !env.AI_CONTROL_TOKEN) return NextResponse.json({ id: messageId, role: 'user', status: 'complete', assistantExecution: 'ai_provider_required' }, { status: 201 });
    const modelId = 'cf-llama-3-2-3b';
    await env.DB.prepare("INSERT INTO model_catalog (id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled,updated_at) VALUES (?, 'cloudflare-workers-ai','@cf/meta/llama-3.2-3b-instruct','[\"text\"]',0.0509,0.335,1,?) ON CONFLICT(id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at").bind(modelId, now).run();
    const history = await env.DB.prepare('SELECT role,content FROM messages WHERE conversation_id=? AND status=? ORDER BY created_at DESC LIMIT 20').bind(input.conversationId, 'complete').all<{ role: string; content: string }>();
    const chronological = [...history.results].reverse();
    const prompt = ['You are FENIX, a precise software product copilot. Answer in the language used by the user. Never claim an action ran unless the conversation contains evidence that it ran.', ...chronological.map((message) => `${message.role.toUpperCase()}: ${message.content}`), 'ASSISTANT:'].join('\n\n').slice(-32_000);
    const estimatedInput = Math.ceil(prompt.length / 4);
    const estimatedOutput = 512;
    const estimatedCost = (estimatedInput * 0.0509 + estimatedOutput * 0.335) / 1_000_000;
    const usage = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM usage_ledger WHERE project_id=?').bind(id).first<{ amount: number }>();
    if (Number(usage?.amount ?? 0) + estimatedCost > 25) return NextResponse.json({ id: messageId, role: 'user', status: 'complete', assistantExecution: 'budget_blocked' }, { status: 201 });
    const assistantId = crypto.randomUUID();
    const callId = crypto.randomUUID();
    const traceId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages (id,conversation_id,role,content,status,metadata_json,created_at) VALUES (?,?,'assistant','','pending',?,?)").bind(assistantId, input.conversationId, JSON.stringify({ callId, traceId }), now + 1),
      env.DB.prepare("INSERT INTO ai_calls (id,organization_id,project_id,model_catalog_id,purpose,status,input_tokens,output_tokens,estimated_cost,trace_id,created_at) VALUES (?,?,?,?,'conversation.reply','running',?,?,?,?,?)").bind(callId, access.organizationId, id, modelId, estimatedInput, estimatedOutput, estimatedCost, traceId, now),
    ]);
    try {
      const response = await invokeManagedAI(env.AI_WORKER_URL, env.AI_CONTROL_TOKEN, { organizationId: access.organizationId, projectId: id, requestId: callId, capability: 'text', prompt, maxTokens: estimatedOutput });
      const result = response.result as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined;
      const assistantContent = String(result?.response ?? '').trim();
      if (!assistantContent) throw new Error('empty_ai_response');
      const actualInput = Number(result?.usage?.prompt_tokens ?? estimatedInput);
      const actualOutput = Number(result?.usage?.completion_tokens ?? Math.ceil(assistantContent.length / 4));
      const actualCost = (actualInput * 0.0509 + actualOutput * 0.335) / 1_000_000;
      const completedAt = Date.now();
      await env.DB.batch([
        env.DB.prepare("UPDATE messages SET content=?,status='complete',metadata_json=? WHERE id=?").bind(assistantContent.slice(0, 20_000), JSON.stringify({ callId, traceId, modelId }), assistantId),
        env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(completedAt, input.conversationId),
        env.DB.prepare("UPDATE ai_calls SET status='completed',input_tokens=?,output_tokens=?,actual_cost=?,completed_at=? WHERE id=?").bind(actualInput, actualOutput, actualCost, completedAt, callId),
        env.DB.prepare("INSERT INTO usage_ledger (id,organization_id,project_id,task_id,kind,units,amount,created_at) VALUES (?,?,?,NULL,'ai_tokens',?,?,?)").bind(crypto.randomUUID(), access.organizationId, id, actualInput + actualOutput, actualCost, completedAt),
      ]);
      return NextResponse.json({ id: messageId, role: 'user', status: 'complete', assistant: { id: assistantId, role: 'assistant', content: assistantContent, status: 'complete', traceId }, assistantExecution: 'completed' }, { status: 201 });
    } catch (error) {
      const completedAt = Date.now();
      await env.DB.batch([
        env.DB.prepare("UPDATE messages SET status='failed',metadata_json=? WHERE id=?").bind(JSON.stringify({ callId, traceId, error: error instanceof Error ? error.message : 'ai_inference_failed' }), assistantId),
        env.DB.prepare("UPDATE ai_calls SET status='failed',completed_at=? WHERE id=?").bind(completedAt, callId),
      ]);
      return NextResponse.json({ id: messageId, role: 'user', status: 'complete', assistant: { id: assistantId, status: 'failed', traceId }, assistantExecution: 'failed' }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
