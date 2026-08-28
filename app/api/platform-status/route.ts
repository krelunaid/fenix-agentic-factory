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
    aiGateway: 'requires_provider',
    github: 'requires_connection',
    deploymentAdapter: 'planned',
  });
}
