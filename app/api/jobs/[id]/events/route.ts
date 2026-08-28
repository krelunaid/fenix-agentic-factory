import { env } from 'cloudflare:workers';
import { requireJobAccess } from '../../../../../lib/core-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return new Response('Not found', { status: 404 });
  const headerSequence = Number(request.headers.get('last-event-id') ?? '0');
  const url = new URL(request.url);
  const querySequence = Number(url.searchParams.get('after') ?? '0');
  const after = Math.max(Number.isFinite(headerSequence) ? headerSequence : 0, Number.isFinite(querySequence) ? querySequence : 0);
  const result = await env.DB.prepare('SELECT rowid AS sequence,id,trace_id,project_id,job_id,task_id,type,severity,human_message,cost_delta,created_at FROM build_events WHERE job_id=? AND rowid>? ORDER BY rowid ASC LIMIT 250').bind(id, after).all();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of result.results as Array<Record<string, unknown> & { sequence: number; type: string }>) {
        controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode(': replay-complete\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}

