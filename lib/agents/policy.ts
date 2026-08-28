export type AgentGuardrails = { allowedTools: string[]; approvalRequiredTools: string[]; maxCostPerRun: number; maxSteps: number };

export function authorizeAgentTool(input: { tool: string; approved: boolean; currentCost: number; step: number }, guardrails: AgentGuardrails) {
  const reasons: string[] = [];
  if (!guardrails.allowedTools.includes(input.tool)) reasons.push('tool_not_allowed');
  if (guardrails.approvalRequiredTools.includes(input.tool) && !input.approved) reasons.push('approval_required');
  if (input.currentCost >= guardrails.maxCostPerRun) reasons.push('cost_cap_reached');
  if (input.step >= guardrails.maxSteps) reasons.push('step_cap_reached');
  return { allowed: reasons.length === 0, reasons };
}

export function nextAgentVersion(existingVersions: number[]) {
  if (existingVersions.some((version) => !Number.isInteger(version) || version < 1)) throw new Error('invalid_agent_version');
  return (Math.max(0, ...existingVersions) + 1);
}
