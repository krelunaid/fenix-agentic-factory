interface Env { DB: D1Database }

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      const database = await env.DB.prepare('SELECT 1 AS ok').first().then(() => 'ready').catch(() => 'unavailable');
      return Response.json({ ok: database === 'ready', database }, { status: database === 'ready' ? 200 : 503 });
    }
    if (url.pathname === '/api/me') {
      const userId = request.headers.get('x-chatgpt-user-id');
      if (!userId) return Response.json({ error: 'authentication_required' }, { status: 401 });
      return Response.json({ userId, displayName: request.headers.get('x-chatgpt-user-name') ?? 'User' });
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
