import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  return NextResponse.json({
    identity: user ? 'connected' : 'anonymous',
    database: 'connected',
    projectCore: 'connected',
    briefVersioning: 'connected',
    orchestrator: 'connected',
    sandbox: env.SANDBOX_WORKER_URL && env.SANDBOX_CONTROL_TOKEN ? 'connected' : 'adapter_ready_requires_provider',
    artifactRegistry: 'connected',
    repositoryIndex: 'connected',
    qualityEvidence: 'connected',
    recoveryKernel: 'connected',
    aiGateway: env.AI_WORKER_URL && env.AI_CONTROL_TOKEN ? 'connected' : 'requires_provider',
    github: 'requires_connection',
    deploymentAdapter: 'requires_connection',
    integrations: 'adapter_ready_requires_connections',
    mobile: 'profile_ready_requires_native_builder',
    billing: 'ledger_ready_requires_payment_provider',
    voice: env.AI_WORKER_URL && env.AI_CONTROL_TOKEN ? 'managed_stt_connected_tts_degraded' : 'policy_ready_requires_streaming_provider',
    agentStudio: env.AI_WORKER_URL && env.AI_CONTROL_TOKEN ? 'managed_inference_connected' : 'versioning_ready_requires_ai_worker',
    mcp: 'permission_model_ready_requires_oauth_provider',
    collaboration: 'connected',
    visualSelect: 'mapping_contract_ready_requires_browser_runner',
    betaCertification: 'not_certified',
  });
}
