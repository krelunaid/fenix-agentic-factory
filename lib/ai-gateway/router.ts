export type ModelCapability = 'text' | 'vision' | 'image_generation' | 'tool_calling' | 'json_schema';

export type ModelCandidate = {
  id: string;
  provider: string;
  model: string;
  capabilities: ModelCapability[];
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  enabled: boolean;
  priority: number;
};

export type RouteRequest = {
  requiredCapabilities: ModelCapability[];
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  maxEstimatedCost: number;
  preferredProvider?: string;
};

export function estimateModelCost(model: Pick<ModelCandidate, 'inputCostPerMillion' | 'outputCostPerMillion'>, inputTokens: number, outputTokens: number) {
  if (![inputTokens, outputTokens].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('invalid_token_estimate');
  return (inputTokens * model.inputCostPerMillion + outputTokens * model.outputCostPerMillion) / 1_000_000;
}

export function routeModel(models: ModelCandidate[], request: RouteRequest) {
  const eligible = models
    .filter((model) => model.enabled && request.requiredCapabilities.every((capability) => model.capabilities.includes(capability)))
    .map((model) => ({ ...model, estimatedCost: estimateModelCost(model, request.estimatedInputTokens, request.estimatedOutputTokens) }))
    .filter((model) => model.estimatedCost <= request.maxEstimatedCost)
    .sort((left, right) => {
      const preferred = Number(right.provider === request.preferredProvider) - Number(left.provider === request.preferredProvider);
      return preferred || left.priority - right.priority || left.estimatedCost - right.estimatedCost;
    });
  if (!eligible.length) throw new Error('no_eligible_model');
  return { selected: eligible[0], fallbacks: eligible.slice(1).map((model) => model.id) };
}

export function reconcileAICost(estimated: number, actual: number, tolerance = 0.05) {
  if (estimated < 0 || actual < 0 || tolerance < 0) throw new Error('invalid_cost');
  const variance = actual - estimated;
  return { estimated, actual, variance, withinTolerance: Math.abs(variance) <= Math.max(estimated * tolerance, 0.000001) };
}
