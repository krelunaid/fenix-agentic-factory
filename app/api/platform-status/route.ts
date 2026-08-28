import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  return NextResponse.json({
    identity: user ? 'connected' : 'anonymous',
    database: 'connected',
    projectCore: 'connected',
    briefVersioning: 'connected',
    orchestrator: 'planned',
    sandbox: 'planned',
    aiGateway: 'requires_provider',
    github: 'requires_connection',
    deploymentAdapter: 'planned',
  });
}

