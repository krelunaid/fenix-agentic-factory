export type ExternalAIProvider = 'xai' | 'anthropic' | 'openai';

export type ExternalAIResult = {
  response: string;
  usage: { promptTokens: number; completionTokens: number };
};

type Fetcher = typeof fetch;

export function normalizeExternalAIProvider(value: string): ExternalAIProvider | null {
  const provider = value.trim().toLowerCase();
  if (['xai', 'x.ai', 'grok'].includes(provider)) return 'xai';
  if (['anthropic', 'claude'].includes(provider)) return 'anthropic';
  if (provider === 'openai') return 'openai';
  return null;
}

function requestHeaders(
  provider: ExternalAIProvider,
  apiKey: string,
): Record<string, string> {
  if (provider === 'anthropic') {
    return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }
  return { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
}

export async function validateExternalAIKey(provider: ExternalAIProvider, apiKey: string, fetcher: Fetcher = fetch) {
  const endpoint = provider === 'xai'
    ? 'https://api.x.ai/v1/models'
    : provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/models'
      : 'https://api.openai.com/v1/models';
  const response = await fetcher(endpoint, {
    headers: requestHeaders(provider, apiKey),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  return { healthy: response.ok, statusCode: response.status };
}

export async function invokeExternalAI(input: {
  provider: ExternalAIProvider;
  model: string;
  apiKey: string;
  prompt: string;
  maxTokens: number;
}, fetcher: Fetcher = fetch): Promise<ExternalAIResult> {
  const maxTokens = Math.min(Math.max(Math.round(input.maxTokens), 1), 8_192);
  const endpoint = input.provider === 'xai'
    ? 'https://api.x.ai/v1/chat/completions'
    : input.provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions';
  const body = input.provider === 'anthropic'
    ? { model: input.model, max_tokens: maxTokens, messages: [{ role: 'user', content: input.prompt }] }
    : { model: input.model, max_tokens: maxTokens, temperature: 0.2, messages: [{ role: 'user', content: input.prompt }] };
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: requestHeaders(input.provider, input.apiKey),
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`external_ai_${input.provider}_${response.status}:${detail.slice(0, 180)}`);
  }
  const payload = await response.json() as Record<string, unknown>;
  if (input.provider === 'anthropic') {
    const blocks = Array.isArray(payload.content) ? payload.content as Array<Record<string, unknown>> : [];
    const text = blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => String(block.text)).join('\n').trim();
    const usage = payload.usage && typeof payload.usage === 'object' ? payload.usage as Record<string, unknown> : {};
    if (!text) throw new Error('external_ai_anthropic_empty_response');
    return { response: text, usage: { promptTokens: Number(usage.input_tokens ?? 0), completionTokens: Number(usage.output_tokens ?? 0) } };
  }
  const choices = Array.isArray(payload.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  const message = choices[0]?.message && typeof choices[0].message === 'object' ? choices[0].message as Record<string, unknown> : {};
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  const usage = payload.usage && typeof payload.usage === 'object' ? payload.usage as Record<string, unknown> : {};
  if (!text) throw new Error(`external_ai_${input.provider}_empty_response`);
  return { response: text, usage: { promptTokens: Number(usage.prompt_tokens ?? 0), completionTokens: Number(usage.completion_tokens ?? 0) } };
}
