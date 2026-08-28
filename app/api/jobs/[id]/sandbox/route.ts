import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { canOperate, requireJobAccess } from '../../../../../lib/core-access';
import { createSandboxClient } from '../../../../../lib/build-plane/sandbox-client';
import { deriveSandboxId } from '../../../../../lib/build-plane/sandbox-id';
import type { SandboxCommand } from '../../../../../lib/build-plane/contracts';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sessions = await env.DB.prepare('SELECT id,provider,status,provider_ref,lease_expires_at,created_at,updated_at FROM sandbox_sessions WHERE job_id=? ORDER BY created_at DESC').bind(id).all();
  const previews = await env.DB.prepare('SELECT id,sandbox_id,url,port,status,expires_at,created_at FROM preview_sessions WHERE job_id=? ORDER BY created_at DESC').bind(id).all();
  return NextResponse.json({ sessions: sessions.results, previews: previews.results, providerConfigured: Boolean(env.SANDBOX_WORKER_URL && env.SANDBOX_CONTROL_TOKEN) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireJobAccess(id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canOperate(access.job.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!env.SANDBOX_WORKER_URL || !env.SANDBOX_CONTROL_TOKEN) return NextResponse.json({ error: 'sandbox_provider_not_configured' }, { status: 503 });
  const input = await request.json().catch(() => null) as { action?: string; command?: SandboxCommand; port?: number; processId?: string } | null;
  const scope = { organizationId: access.job.organization_id, projectId: access.job.project_id, jobId: id };
  const sandboxId = await deriveSandboxId(scope);
  const client = createSandboxClient(env.SANDBOX_WORKER_URL, env.SANDBOX_CONTROL_TOKEN);
  const now = Date.now();

  try {
    if (input?.action === 'exec' && input.command) {
      const result = await client.exec(scope, input.command);
      await env.DB.prepare("INSERT INTO sandbox_sessions (id,project_id,job_id,provider,provider_ref,status,constraints_json,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'ready',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready',updated_at=excluded.updated_at,lease_expires_at=excluded.lease_expires_at")
        .bind(sandboxId, access.job.project_id, id, 'cloudflare-sandbox', sandboxId, JSON.stringify({ cwd: '/workspace', maxTimeoutMs: 300000 }), now + 600_000, now, now).run();
      return NextResponse.json({ sandboxId, result });
    }
    if (input?.action === 'preview') {
      const preview = await client.preview(scope, input.port ?? 8080);
      const previewId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sandbox_sessions (id,project_id,job_id,provider,provider_ref,status,constraints_json,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'ready',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready',updated_at=excluded.updated_at,lease_expires_at=excluded.lease_expires_at").bind(sandboxId, access.job.project_id, id, 'cloudflare-sandbox', sandboxId, '{}', now + 600_000, now, now),
        env.DB.prepare("INSERT INTO preview_sessions (id,project_id,job_id,sandbox_id,url,port,status,expires_at,created_at) VALUES (?,?,?,?,?,?,'ready',?,?)").bind(previewId, access.job.project_id, id, sandboxId, preview.url, preview.port, now + 600_000, now),
      ]);
      return NextResponse.json({ id: previewId, ...preview, expiresAt: now + 600_000 }, { status: 201 });
    }
    if (input?.action === 'start-preview' && input.command) {
      const port = input.port ?? 8080;
      const process = await client.startProcess(scope, input.command, port);
      const preview = await client.preview(scope, port);
      const previewId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sandbox_sessions (id,project_id,job_id,provider,provider_ref,status,constraints_json,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'ready',?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready',updated_at=excluded.updated_at,lease_expires_at=excluded.lease_expires_at").bind(sandboxId, access.job.project_id, id, 'cloudflare-sandbox', sandboxId, JSON.stringify({ processId: process.processId, port }), now + 600_000, now, now),
        env.DB.prepare("INSERT INTO preview_sessions (id,project_id,job_id,sandbox_id,url,port,status,expires_at,created_at) VALUES (?,?,?,?,?,?,'ready',?,?)").bind(previewId, access.job.project_id, id, sandboxId, preview.url, port, now + 600_000, now),
      ]);
      return NextResponse.json({ id: previewId, processId: process.processId, ...preview, expiresAt: now + 600_000 }, { status: 201 });
    }
    if (input?.action === 'kill-process' && typeof input.processId === 'string') {
      await client.killProcess(scope, input.processId);
      return NextResponse.json({ processId: input.processId, status: 'killed' });
    }
    if (input?.action === 'destroy') {
      await client.destroy(scope);
      await env.DB.batch([
        env.DB.prepare("UPDATE sandbox_sessions SET status='destroyed',updated_at=? WHERE id=? AND job_id=?").bind(now, sandboxId, id),
        env.DB.prepare("UPDATE preview_sessions SET status='expired' WHERE sandbox_id=? AND job_id=?").bind(sandboxId, id),
      ]);
      return NextResponse.json({ sandboxId, status: 'destroyed' });
    }
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sandbox_provider_error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
