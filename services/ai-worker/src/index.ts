type Env = { AI: Ai; CONTROL_PLANE_TOKEN: string };
type Capability = 'text' | 'vision';
type InferRequest = { organizationId: string; projectId: string; requestId: string; capability: Capability; prompt: string; maxTokens?: number; image?: number[] };

const encoder = new TextEncoder();
const idPattern = /^[a-zA-Z0-9_-]{1,96}$/;
const models: Record<Capability, string> = {
  text: '@cf/meta/llama-3.2-3b-instruct',
  vision: '@cf/meta/llama-3.2-11b-vision-instruct',
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
    if (request.method !== 'POST' || url.pathname !== '/v1/infer') return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await request.text();
    if (!env.CONTROL_PLANE_TOKEN || !await authorized(request, body, env.CONTROL_PLANE_TOKEN)) return Response.json({ error: 'unauthorized' }, { status: 401 });
    let input: InferRequest;
    try { input = JSON.parse(body) as InferRequest; } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    if (![input.organizationId, input.projectId, input.requestId].every((value) => typeof value === 'string' && idPattern.test(value)) || !models[input.capability] || typeof input.prompt !== 'string' || input.prompt.length < 1 || input.prompt.length > 32_000) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (input.capability === 'vision' && (!Array.isArray(input.image) || input.image.length === 0 || input.image.length > 5_000_000)) return Response.json({ error: 'vision_image_required' }, { status: 400 });
    const maxTokens = Math.min(Math.max(Math.round(input.maxTokens ?? 512), 1), 2048);
    const model = models[input.capability];
    const payload = input.capability === 'vision'
      ? { prompt: input.prompt, image: input.image, max_tokens: maxTokens }
      : { messages: [{ role: 'user', content: input.prompt }], max_tokens: maxTokens };
    try {
      const result = await env.AI.run(model as Parameters<Ai['run']>[0], payload as never);
      return Response.json({ provider: 'cloudflare-workers-ai', model, capability: input.capability, result });
    } catch (error) {
      return Response.json({ error: 'provider_inference_failed', message: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
