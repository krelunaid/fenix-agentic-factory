import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeExternalAI, normalizeExternalAIProvider, validateExternalAIKey } from '../lib/ai-gateway/external';

test('external provider aliases normalize to stable routing ids', () => {
  assert.equal(normalizeExternalAIProvider('Grok'), 'xai');
  assert.equal(normalizeExternalAIProvider('Claude'), 'anthropic');
  assert.equal(normalizeExternalAIProvider('unknown'), null);
});

test('Claude uses the Messages API and extracts text usage', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ content: [{ type: 'text', text: 'review passed' }], usage: { input_tokens: 12, output_tokens: 4 } });
  }) as typeof fetch;
  const result = await invokeExternalAI({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'test-key', prompt: 'Review', maxTokens: 500 }, fetcher);
  assert.equal(result.response, 'review passed');
  assert.deepEqual(result.usage, { promptTokens: 12, completionTokens: 4 });
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal((calls[0].init?.headers as Record<string, string>)['x-api-key'], 'test-key');
});

test('Grok uses the chat completions API and validates without exposing the key', async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    urls.push(String(url));
    if (String(url).endsWith('/models')) return new Response('{}', { status: 200 });
    return Response.json({ choices: [{ message: { content: 'build ready' } }], usage: { prompt_tokens: 20, completion_tokens: 5 } });
  }) as typeof fetch;
  assert.deepEqual(await validateExternalAIKey('xai', 'test-key', fetcher), { healthy: true, statusCode: 200 });
  assert.equal((await invokeExternalAI({ provider: 'xai', model: 'grok-4.6', apiKey: 'test-key', prompt: 'Build', maxTokens: 500 }, fetcher)).response, 'build ready');
  assert.deepEqual(urls, ['https://api.x.ai/v1/models', 'https://api.x.ai/v1/chat/completions']);
});
