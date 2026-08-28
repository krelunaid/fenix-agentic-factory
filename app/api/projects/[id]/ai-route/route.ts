import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireProjectAccess } from '../../../../../lib/core-access';
import { routeModel, type ModelCandidate, type ModelCapability } from '../../../../../lib/ai-gateway/router';

export const dynamic = 'force-dynamic';

const capabilities = new Set<ModelCapability>(['text', 'vision', 'image_generation', 'tool_calling', 'json_schema']);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
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
  const input = await request.json().catch(() => null) as { jobId?: unknown; taskId?: unknown; purpose?: unknown; requiredCapabilities?: unknown; estimatedInputTokens?: unknown; estimatedOutputTokens?: unknown; preferredProvider?: unknown } | null;
  const requiredCapabilities = Array.isArray(input?.requiredCapabilities) ? input.requiredCapabilities.filter((value): value is ModelCapability => typeof value === 'string' && capabilities.has(value as ModelCapability)) : [];
  if (!input || typeof input.purpose !== 'string' || !requiredCapabilities.length) return NextResponse.json({ error: 'invalid_route_request' }, { status: 400 });
  const inputTokens = typeof input.estimatedInputTokens === 'number' ? Math.max(0, Math.round(input.estimatedInputTokens)) : 0;
  const outputTokens = typeof input.estimatedOutputTokens === 'number' ? Math.max(0, Math.round(input.estimatedOutputTokens)) : 0;
  const job = typeof input.jobId === 'string' ? await env.DB.prepare('SELECT id,budget_limit FROM jobs WHERE id=? AND project_id=?').bind(input.jobId, id).first<{ id: string; budget_limit: number }>() : null;
  if (typeof input.jobId === 'string' && !job) return NextResponse.json({ error: 'job_scope_mismatch' }, { status: 400 });
  const usage = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM usage_ledger WHERE project_id=?').bind(id).first<{ amount: number }>();
  const remainingBudget = Math.max(0, (job?.budget_limit ?? 25) - (usage?.amount ?? 0));
  const rows = await env.DB.prepare('SELECT id,provider,model,capabilities_json,input_cost_per_million,output_cost_per_million,enabled FROM model_catalog WHERE enabled=1').all();
  const models: ModelCandidate[] = (rows.results as Array<Record<string, unknown>>).map((row, priority) => ({
    id: String(row.id), provider: String(row.provider), model: String(row.model), capabilities: JSON.parse(String(row.capabilities_json)) as ModelCapability[],
    inputCostPerMillion: Number(row.input_cost_per_million), outputCostPerMillion: Number(row.output_cost_per_million), enabled: Boolean(row.enabled), priority,
  }));
  let route;
  try {
    route = routeModel(models, { requiredCapabilities, estimatedInputTokens: inputTokens, estimatedOutputTokens: outputTokens, maxEstimatedCost: remainingBudget, preferredProvider: typeof input.preferredProvider === 'string' ? input.preferredProvider : undefined });
  } catch {
    return NextResponse.json({ error: models.length ? 'no_eligible_model_within_budget' : 'ai_provider_not_configured', remainingBudget }, { status: 503 });
  }
  const credential = await env.DB.prepare("SELECT id FROM ai_credentials WHERE organization_id=? AND provider=? AND status='active' ORDER BY created_at DESC LIMIT 1").bind(access.organizationId, route.selected.provider).first();
  if (!credential) return NextResponse.json({ error: 'ai_credential_not_configured', provider: route.selected.provider }, { status: 503 });
  const callId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO ai_calls (id,organization_id,project_id,job_id,task_id,model_catalog_id,purpose,status,input_tokens,output_tokens,estimated_cost,trace_id,created_at) VALUES (?,?,?,?,?,?,?,'estimated',?,?,?,?,?)")
    .bind(callId, access.organizationId, id, job?.id ?? null, typeof input.taskId === 'string' ? input.taskId : null, route.selected.id, input.purpose.slice(0, 100), inputTokens, outputTokens, route.selected.estimatedCost, traceId, now).run();
  return NextResponse.json({ callId, traceId, model: { id: route.selected.id, provider: route.selected.provider, model: route.selected.model }, fallbackModelIds: route.fallbacks, estimatedCost: route.selected.estimatedCost, remainingBudget, status: 'estimated', execution: 'not_started' }, { status: 201 });
}
