import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { routeModel, type ModelCandidate, type ModelCapability } from '../../../../../lib/ai-gateway/router';
import { invokeManagedAI } from '../../../../../lib/ai-gateway/client';

export const dynamic = 'force-dynamic';

const capabilities = new Set<ModelCapability>(['text', 'vision', 'image_generation', 'tool_calling', 'json_schema']);

async function ensureManagedCatalog() {
  if (!env.AI_WORKER_URL || !env.AI_CONTROL_TOKEN) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO model_catalog (id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled,updated_at) VALUES ('cf-llama-3-2-3b','cloudflare-workers-ai','@cf/meta/llama-3.2-3b-instruct','[\"text\"]',0.0509,0.335,1,?) ON CONFLICT(id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at").bind(now),
    env.DB.prepare("INSERT INTO model_catalog (id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled,updated_at) VALUES ('cf-llama-3-2-vision','cloudflare-workers-ai','@cf/meta/llama-3.2-11b-vision-instruct','[\"text\",\"vision\"]',0.0485,0.676,1,?) ON CONFLICT(id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at").bind(now),
    env.DB.prepare("INSERT INTO model_catalog (id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled,updated_at) VALUES ('cf-flux-1-schnell','cloudflare-workers-ai','@cf/black-forest-labs/flux-1-schnell','[\"image_generation\"]',0,0,1,?) ON CONFLICT(id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at").bind(now),
  ]);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await ensureManagedCatalog();
  const [models, calls] = await Promise.all([
    env.DB.prepare('SELECT id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled,updated_at FROM model_catalog WHERE enabled=1 ORDER BY provider,model').all(),
    env.DB.prepare('SELECT id,job_id,task_id,model_catalog_id,purpose,status,input_tokens,output_tokens,estimated_cost,actual_cost,fallback_from,trace_id,created_at,completed_at FROM ai_calls WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all(),
  ]);
  return NextResponse.json({ models: models.results, calls: calls.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const input = await request.json().catch(() => null) as { jobId?: unknown; taskId?: unknown; purpose?: unknown; requiredCapabilities?: unknown; estimatedInputTokens?: unknown; estimatedOutputTokens?: unknown; preferredProvider?: unknown; prompt?: unknown; image?: unknown; maxTokens?: unknown } | null;
  const requiredCapabilities = Array.isArray(input?.requiredCapabilities) ? input.requiredCapabilities.filter((value): value is ModelCapability => typeof value === 'string' && capabilities.has(value as ModelCapability)) : [];
  if (!input || typeof input.purpose !== 'string' || !requiredCapabilities.length) return NextResponse.json({ error: 'invalid_route_request' }, { status: 400 });
  const requestedInputTokens = typeof input.estimatedInputTokens === 'number' ? Math.max(0, Math.round(input.estimatedInputTokens)) : 0;
  const requestedOutputTokens = typeof input.estimatedOutputTokens === 'number' ? Math.max(0, Math.round(input.estimatedOutputTokens)) : 0;
  const inputTokens = Math.max(requestedInputTokens, typeof input.prompt === 'string' ? Math.ceil(input.prompt.length / 4) : 0);
  const outputTokens = Math.max(requestedOutputTokens, typeof input.maxTokens === 'number' ? Math.min(Math.max(Math.round(input.maxTokens), 1), 2048) : 0);
  const job = typeof input.jobId === 'string' ? await env.DB.prepare('SELECT id,status,budget_limit FROM jobs WHERE id=? AND project_id=?').bind(input.jobId, id).first<{ id: string; status: string; budget_limit: number }>() : null;
  if (typeof input.jobId === 'string' && !job) return NextResponse.json({ error: 'job_scope_mismatch' }, { status: 400 });
  if (job && !['RUNNING', 'VALIDATING'].includes(job.status)) return NextResponse.json({ error: 'job_not_executable', status: job.status }, { status: 409 });
  const usage = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM usage_ledger WHERE project_id=?').bind(id).first<{ amount: number }>();
  const remainingBudget = Math.max(0, (job?.budget_limit ?? 25) - (usage?.amount ?? 0));
  await ensureManagedCatalog();
  const rows = await env.DB.prepare('SELECT id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled FROM model_catalog WHERE enabled=1').all();
  const models: ModelCandidate[] = (rows.results as Array<Record<string, unknown>>).map((row, priority) => ({
    id: String(row.id), provider: String(row.provider), model: String(row.model), capabilities: JSON.parse(String(row.capabilities_json)) as ModelCapability[],
    inputCostPerMillion: Number(row.input_cost_per_million), outputCostPerMillion: Number(row.output_cost_per_million), enabled: Boolean(row.enabled), priority,
  }));
  let route;
  try {
    route = routeModel(models, { requiredCapabilities, estimatedInputTokens: inputTokens, estimatedOutputTokens: outputTokens, maxEstimatedCost: remainingBudget, preferredProvider: typeof input.preferredProvider === 'string' ? input.preferredProvider : undefined });
  } catch {
    const capabilityCandidates = models.filter((model) => requiredCapabilities.every((capability) => model.capabilities.includes(capability)));
    const lowestEstimate = capabilityCandidates.length ? Math.min(...capabilityCandidates.map((model) => (inputTokens * model.inputCostPerMillion + outputTokens * model.outputCostPerMillion) / 1_000_000)) : null;
    if (job && lowestEstimate !== null && lowestEstimate > remainingBudget) {
      const pausedAt = Date.now();
      await env.DB.batch([
        env.DB.prepare("UPDATE jobs SET status='PAUSED',updated_at=? WHERE id=? AND project_id=? AND status IN ('RUNNING','VALIDATING')").bind(pausedAt, job.id, id),
        env.DB.prepare("INSERT INTO build_events (id,trace_id,project_id,job_id,type,severity,human_message,cost_delta,created_at) VALUES (?,?,?,?, 'budget.exhausted','warning','Job sospeso: budget IA insufficiente',0,?)").bind(crypto.randomUUID(), crypto.randomUUID(), id, job.id, pausedAt),
      ]);
      return NextResponse.json({ error: 'budget_exhausted_job_paused', remainingBudget, requiredEstimate: lowestEstimate }, { status: 402 });
    }
    return NextResponse.json({ error: models.length ? 'no_eligible_model' : 'ai_provider_not_configured', remainingBudget }, { status: 503 });
  }
  const managed = route.selected.provider === 'cloudflare-workers-ai' && env.AI_WORKER_URL && env.AI_CONTROL_TOKEN;
  const credential = managed ? { id: 'managed' } : await env.DB.prepare("SELECT id FROM ai_credentials WHERE organization_id=? AND provider=? AND status='active' ORDER BY created_at DESC LIMIT 1").bind(access.organizationId, route.selected.provider).first();
  if (!credential) return NextResponse.json({ error: 'ai_credential_not_configured', provider: route.selected.provider }, { status: 503 });
  const callId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO ai_calls (id,organization_id,project_id,job_id,task_id,model_catalog_id,purpose,status,input_tokens,output_tokens,estimated_cost,trace_id,created_at) VALUES (?,?,?,?,?,?,?,'estimated',?,?,?,?,?)")
    .bind(callId, access.organizationId, id, job?.id ?? null, typeof input.taskId === 'string' ? input.taskId : null, route.selected.id, input.purpose.slice(0, 100), inputTokens, outputTokens, route.selected.estimatedCost, traceId, now).run();
  if (typeof input.prompt !== 'string') return NextResponse.json({ callId, traceId, model: { id: route.selected.id, provider: route.selected.provider, model: route.selected.model }, fallbackModelIds: route.fallbacks, estimatedCost: route.selected.estimatedCost, remainingBudget, status: 'estimated', execution: 'not_started' }, { status: 201 });
  if (!managed) return NextResponse.json({ callId, traceId, status: 'estimated', execution: 'external_adapter_required' }, { status: 202 });
  const capability = requiredCapabilities.includes('image_generation') ? 'image_generation' : requiredCapabilities.includes('vision') ? 'vision' : 'text';
  const image = Array.isArray(input.image) ? input.image.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 255) : undefined;
  try {
    const response = await invokeManagedAI(env.AI_WORKER_URL!, env.AI_CONTROL_TOKEN!, { organizationId: access.organizationId, projectId: id, requestId: callId, capability, prompt: input.prompt.slice(0, capability === 'image_generation' ? 2_048 : 32_000), maxTokens: typeof input.maxTokens === 'number' ? Math.min(Math.max(Math.round(input.maxTokens), 1), 2048) : Math.min(Math.max(outputTokens, 1), 2048), image });
    const providerResult = response.result as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined;
    const actualInput = Number(providerResult?.usage?.prompt_tokens ?? inputTokens);
    const actualOutput = Number(providerResult?.usage?.completion_tokens ?? outputTokens);
    const actualCost = (actualInput * route.selected.inputCostPerMillion + actualOutput * route.selected.outputCostPerMillion) / 1_000_000;
    const completedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE ai_calls SET status='completed',input_tokens=?,output_tokens=?,actual_cost=?,completed_at=? WHERE id=?").bind(actualInput, actualOutput, actualCost, completedAt, callId),
      env.DB.prepare("INSERT INTO usage_ledger (id,organization_id,project_id,task_id,kind,units,amount,created_at) VALUES (?,?,?,?, 'ai_tokens',?,?,?)").bind(crypto.randomUUID(), access.organizationId, id, typeof input.taskId === 'string' ? input.taskId : null, actualInput + actualOutput, actualCost, completedAt),
    ]);
    return NextResponse.json({ callId, traceId, model: { id: route.selected.id, provider: route.selected.provider, model: route.selected.model }, response: providerResult?.response ?? response, usage: { inputTokens: actualInput, outputTokens: actualOutput, actualCost }, status: 'completed' }, { status: 201 });
  } catch (error) {
    await env.DB.prepare("UPDATE ai_calls SET status='failed',completed_at=? WHERE id=?").bind(Date.now(), callId).run();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ai_inference_failed', callId, traceId }, { status: 502 });
  }
}
