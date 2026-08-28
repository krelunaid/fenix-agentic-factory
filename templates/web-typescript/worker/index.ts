interface Env { DB: D1Database }

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      const database = await env.DB.prepare('SELECT 1 AS ok').first().then(() => 'ready').catch(() => 'unavailable');
      return Response.json({ ok: database === 'ready', database }, { status: database === 'ready' ? 200 : 503 });
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
