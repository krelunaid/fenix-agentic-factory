type Env = { AI: Ai; CONTROL_PLANE_TOKEN: string };
type Capability = 'text' | 'vision' | 'image_generation';
type InferRequest = { organizationId: string; projectId: string; requestId: string; capability: Capability; prompt: string; maxTokens?: number; image?: number[] };

const encoder = new TextEncoder();
const idPattern = /^[a-zA-Z0-9_-]{1,96}$/;
const models: Record<Capability, string> = {
  text: '@cf/meta/llama-3.2-3b-instruct',
  vision: '@cf/meta/llama-3.2-11b-vision-instruct',
  image_generation: '@cf/black-forest-labs/flux-1-schnell',
};

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authorized(request: Request, body: string, secret: string) {
  const timestamp = request.headers.get('x-fenix-timestamp');
  const provided = request.headers.get('x-fenix-signature');
  if (!timestamp || !provided || !/^v1=[a-f0-9]{64}$/.test(provided) || Math.abs(Date.now() - Number(timestamp)) > 60_000) return false;
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const canonical = `${request.method}\n${new URL(request.url).pathname}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(provided.slice(3).match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(canonical));
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, provider: 'cloudflare-workers-ai', capabilities: Object.keys(models) });
    if (request.method !== 'POST' || !['/v1/infer', '/v1/stt', '/v1/tts'].includes(url.pathname)) return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await request.text();
    if (!env.CONTROL_PLANE_TOKEN || !await authorized(request, body, env.CONTROL_PLANE_TOKEN)) return Response.json({ error: 'unauthorized' }, { status: 401 });
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    const scoped = raw as Partial<InferRequest> & { audio?: unknown; text?: unknown; language?: unknown };
    if (![scoped.organizationId, scoped.projectId, scoped.requestId].every((value) => typeof value === 'string' && idPattern.test(value))) return Response.json({ error: 'invalid_scope' }, { status: 400 });
    if (url.pathname === '/v1/stt') {
      if (!Array.isArray(scoped.audio) || scoped.audio.length < 1 || scoped.audio.length > 10_000_000 || !scoped.audio.every((value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)) return Response.json({ error: 'invalid_audio' }, { status: 400 });
      try { return Response.json({ provider: 'cloudflare-workers-ai', model: '@cf/openai/whisper', result: await env.AI.run('@cf/openai/whisper', { audio: scoped.audio as number[] }) }); }
      catch (error) { return Response.json({ error: 'provider_stt_failed', message: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }, { status: 502 }); }
    }
    if (url.pathname === '/v1/tts') {
      if (typeof scoped.text !== 'string' || scoped.text.length < 1 || scoped.text.length > 5_000 || (scoped.language !== 'it' && scoped.language !== 'en')) return Response.json({ error: 'invalid_tts_request' }, { status: 400 });
      try { return Response.json({ provider: 'cloudflare-workers-ai', model: '@cf/myshell-ai/melotts', result: await env.AI.run('@cf/myshell-ai/melotts', { prompt: scoped.text, lang: scoped.language }) }); }
      catch (error) { return Response.json({ error: 'provider_tts_failed', message: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }, { status: 502 }); }
    }
    const input = scoped as InferRequest;
    const promptLimit = input.capability === 'image_generation' ? 2_048 : 32_000;
    if (![input.organizationId, input.projectId, input.requestId].every((value) => typeof value === 'string' && idPattern.test(value)) || !models[input.capability] || typeof input.prompt !== 'string' || input.prompt.length < 1 || input.prompt.length > promptLimit) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (input.capability === 'vision' && (!Array.isArray(input.image) || input.image.length === 0 || input.image.length > 5_000_000)) return Response.json({ error: 'vision_image_required' }, { status: 400 });
    const maxTokens = Math.min(Math.max(Math.round(input.maxTokens ?? 512), 1), 2048);
    const model = models[input.capability];
    const payload = input.capability === 'vision'
      ? { prompt: input.prompt, image: input.image, max_tokens: maxTokens }
      : input.capability === 'image_generation'
        ? { prompt: input.prompt, steps: 4 }
        : { messages: [{ role: 'user', content: input.prompt }], max_tokens: maxTokens };
    try {
      const result = await env.AI.run(model as Parameters<Ai['run']>[0], payload as never);
      return Response.json({ provider: 'cloudflare-workers-ai', model, capability: input.capability, result });
    } catch (error) {
      return Response.json({ error: 'provider_inference_failed', message: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
