import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { nextAgentVersion } from '../../../../../lib/agents/policy';
import { invokeManagedAI } from '../../../../../lib/ai-gateway/client';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const profiles = await env.DB.prepare('SELECT id,name,status,created_by,created_at,updated_at FROM agent_profiles WHERE organization_id=? AND (project_id=? OR project_id IS NULL) ORDER BY updated_at DESC').bind(access.organizationId, id).all();
  const versions = await env.DB.prepare('SELECT v.id,v.agent_id,v.version,v.instructions,v.tools_json,v.knowledge_json,v.memory_policy_json,v.guardrails_json,v.created_by,v.created_at FROM agent_versions v JOIN agent_profiles a ON a.id=v.agent_id WHERE a.organization_id=? AND (a.project_id=? OR a.project_id IS NULL) ORDER BY v.created_at DESC').bind(access.organizationId, id).all();
  return NextResponse.json({ profiles: profiles.results, versions: versions.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { action?: unknown; name?: unknown; agentId?: unknown; instructions?: unknown; tools?: unknown; knowledge?: unknown; memoryPolicy?: unknown; guardrails?: unknown; versionId?: unknown; message?: unknown; maxTokens?: unknown } | null;
  const now = Date.now();
  if (input?.action === 'create-profile' && typeof input.name === 'string') {
    const agentId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO agent_profiles (id,organization_id,project_id,name,status,created_by,created_at,updated_at) VALUES (?,?,?,?,'draft',?,?,?)").bind(agentId, access.organizationId, id, input.name.slice(0, 120), access.user.userId, now, now).run();
    return NextResponse.json({ id: agentId, status: 'draft' }, { status: 201 });
  }
  if (input?.action === 'create-version' && typeof input.agentId === 'string' && typeof input.instructions === 'string') {
    const agent = await env.DB.prepare('SELECT id FROM agent_profiles WHERE id=? AND organization_id=? AND project_id=?').bind(input.agentId, access.organizationId, id).first();
    if (!agent) return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
    const rows = await env.DB.prepare('SELECT version FROM agent_versions WHERE agent_id=?').bind(input.agentId).all();
    const version = nextAgentVersion((rows.results as Array<{ version: number }>).map((row) => row.version));
    const versionId = crypto.randomUUID();
    const guardrails = input.guardrails && typeof input.guardrails === 'object' ? input.guardrails : { allowedTools: [], approvalRequiredTools: [], maxCostPerRun: 1, maxSteps: 20 };
    await env.DB.prepare('INSERT INTO agent_versions (id,agent_id,version,instructions,tools_json,knowledge_json,memory_policy_json,guardrails_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(versionId, input.agentId, version, input.instructions.slice(0, 20000), JSON.stringify(Array.isArray(input.tools) ? input.tools : []), JSON.stringify(Array.isArray(input.knowledge) ? input.knowledge : []), JSON.stringify(input.memoryPolicy ?? {}), JSON.stringify(guardrails), access.user.userId, now).run();
    return NextResponse.json({ id: versionId, agentId: input.agentId, version }, { status: 201 });
  }
  if (input?.action === 'plan-run' && typeof input.versionId === 'string') {
    const version = await env.DB.prepare('SELECT v.id,v.instructions,v.guardrails_json FROM agent_versions v JOIN agent_profiles a ON a.id=v.agent_id WHERE v.id=? AND a.organization_id=? AND a.project_id=?').bind(input.versionId, access.organizationId, id).first<{ id: string; instructions: string; guardrails_json: string }>();
    const managed = Boolean(env.AI_WORKER_URL && env.AI_CONTROL_TOKEN);
    const credential = managed ? { id: 'managed' } : await env.DB.prepare("SELECT id FROM ai_credentials WHERE organization_id=? AND status='active' LIMIT 1").bind(access.organizationId).first();
    if (!version || !credential) return NextResponse.json({ error: 'agent_version_or_ai_provider_not_ready' }, { status: 503 });
    const runId = crypto.randomUUID();
    const traceId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO agent_runs (id,agent_version_id,project_id,status,trace_id,cost,evaluation_json,created_at) VALUES (?,?,?,'queued',?,0,'{}',?)").bind(runId, input.versionId, id, traceId, now).run();
    if (!managed || typeof input.message !== 'string') return NextResponse.json({ id: runId, traceId, status: 'queued', execution: managed ? 'message_required' : 'external_agent_worker_required' }, { status: 202 });
    const guardrails = JSON.parse(version.guardrails_json) as { maxCostPerRun?: number; maxSteps?: number };
    if (!Number.isFinite(guardrails.maxCostPerRun) || Number(guardrails.maxCostPerRun) <= 0 || Number(guardrails.maxSteps) < 1) return NextResponse.json({ error: 'invalid_agent_guardrails', id: runId }, { status: 409 });
    try {
      const result = await invokeManagedAI(env.AI_WORKER_URL!, env.AI_CONTROL_TOKEN!, { organizationId: access.organizationId, projectId: id, requestId: runId, capability: 'text', prompt: `${version.instructions}\n\nUser request:\n${input.message.slice(0, 20_000)}`, maxTokens: typeof input.maxTokens === 'number' ? Math.min(Math.max(Math.round(input.maxTokens), 1), 2048) : 512 });
      const provider = result.result as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined;
      const promptTokens = Number(provider?.usage?.prompt_tokens ?? 0);
      const completionTokens = Number(provider?.usage?.completion_tokens ?? 0);
      const cost = (promptTokens * 0.0509 + completionTokens * 0.335) / 1_000_000;
      if (cost > Number(guardrails.maxCostPerRun)) {
        await env.DB.prepare("UPDATE agent_runs SET status='blocked',cost=?,evaluation_json=? WHERE id=?").bind(cost, JSON.stringify({ reason: 'cost_cap_exceeded', promptTokens, completionTokens }), runId).run();
        return NextResponse.json({ error: 'agent_cost_cap_exceeded', id: runId, traceId }, { status: 409 });
      }
      await env.DB.prepare("UPDATE agent_runs SET status='completed',cost=?,evaluation_json=? WHERE id=?").bind(cost, JSON.stringify({ promptTokens, completionTokens, provider: 'cloudflare-workers-ai', guardrailsApplied: true }), runId).run();
      return NextResponse.json({ id: runId, traceId, status: 'completed', response: provider?.response ?? result, cost });
    } catch (error) {
      await env.DB.prepare("UPDATE agent_runs SET status='failed',evaluation_json=? WHERE id=?").bind(JSON.stringify({ error: error instanceof Error ? error.message : 'agent_inference_failed' }), runId).run();
      return NextResponse.json({ error: 'agent_inference_failed', id: runId, traceId }, { status: 502 });
    }
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
