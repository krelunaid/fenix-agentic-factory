export type McpPermission = 'project.read' | 'project.create' | 'message.send' | 'preview.read' | 'job.pause' | 'job.resume' | 'deploy.request';

export function authorizeMcpTool(input: { permission: McpPermission; granted: McpPermission[]; connectionStatus: string; callsInWindow: number; rateLimit: number }) {
  const reasons: string[] = [];
  if (input.connectionStatus !== 'active') reasons.push('connection_inactive');
  if (!input.granted.includes(input.permission)) reasons.push('permission_denied');
  if (input.callsInWindow >= input.rateLimit) reasons.push('rate_limit_exceeded');
  return { allowed: reasons.length === 0, reasons };
}

export function sanitizeMcpOutput(output: unknown) {
  if (!output || typeof output !== 'object') return output;
  const value = structuredClone(output as Record<string, unknown>);
  for (const key of ['policy', 'permissions', 'approval', 'role', 'budgetLimit']) delete value[key];
  return value;
}
