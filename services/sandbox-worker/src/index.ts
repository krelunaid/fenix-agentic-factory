import { getSandbox, type Sandbox as SandboxType } from '@cloudflare/sandbox';

export { Sandbox } from '@cloudflare/sandbox';

type Env = {
  Sandbox: DurableObjectNamespace<SandboxType>;
  CONTROL_PLANE_TOKEN: string;
  SANDBOX_TRANSPORT: string;
};

type Scope = { organizationId: string; projectId: string; jobId: string };
type ScopedRequest = { sandboxId: string; scope: Scope };
type ExecRequest = ScopedRequest & { executable: string; args?: string[]; cwd?: string; timeoutMs?: number };
type StartProcessRequest = ExecRequest & { port?: number };

const allowedExecutables = new Set(['node', 'pnpm', 'npm', 'git', 'tsc', 'eslint', 'vitest', 'playwright']);
const identifierPattern = /^[a-zA-Z0-9_-]{1,96}$/;
const sandboxPattern = /^fnx-[a-f0-9]{24}$/;
const encoder = new TextEncoder();

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function expectedSandboxId(scope: Scope) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${scope.organizationId}:${scope.projectId}:${scope.jobId}`));
  return `fnx-${bytesToHex(digest).slice(0, 24)}`;
}

function validScope(scope: unknown): scope is Scope {
  if (!scope || typeof scope !== 'object') return false;
  const candidate = scope as Partial<Scope>;
  return [candidate.organizationId, candidate.projectId, candidate.jobId].every(
    (value) => typeof value === 'string' && identifierPattern.test(value),
  );
}

async function verifySignature(request: Request, body: string, secret: string) {
  const timestamp = request.headers.get('x-fenix-timestamp');
  const provided = request.headers.get('x-fenix-signature');
  if (!timestamp || !provided || !/^v1=[a-f0-9]{64}$/.test(provided)) return false;
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 60_000) return false;
  const bodyHash = bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const canonical = `${request.method}\n${new URL(request.url).pathname}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(provided.slice(3).match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(canonical));
}

function quoteShell(value: string) {
  if (value.includes('\0') || value.includes('\n') || value.length > 4096) throw new Error('invalid_argument');
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function validateWorkspacePath(value: string) {
  if (!value.startsWith('/workspace') || value.includes('/../') || value.endsWith('/..')) throw new Error('path_outside_workspace');
  return value;
}

async function retry<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function parseScopedRequest(rawBody: string) {
  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    throw new Error('invalid_json');
  }
  const candidate = input as Partial<ScopedRequest>;
  if (!validScope(candidate.scope) || typeof candidate.sandboxId !== 'string' || !sandboxPattern.test(candidate.sandboxId)) {
    throw new Error('invalid_scope');
  }
  if (candidate.sandboxId !== await expectedSandboxId(candidate.scope)) throw new Error('sandbox_scope_mismatch');
  return candidate as ScopedRequest;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'fenix-sandbox-worker', transport: env.SANDBOX_TRANSPORT });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const rawBody = await request.text();
    if (!env.CONTROL_PLANE_TOKEN || !await verifySignature(request, rawBody, env.CONTROL_PLANE_TOKEN)) {
      return json({ error: 'unauthorized' }, 401);
    }

    try {
      const scoped = await parseScopedRequest(rawBody);
      const sandbox = getSandbox(env.Sandbox, scoped.sandboxId, {
        transport: 'rpc',
        enableDefaultSession: false,
        sleepAfter: '10m',
      });
      const input = JSON.parse(rawBody) as ScopedRequest & Record<string, unknown>;

      if (url.pathname === '/v1/sandboxes/exec') {
        const command = input as unknown as ExecRequest;
        if (!allowedExecutables.has(command.executable) || !Array.isArray(command.args ?? [])) throw new Error('command_not_allowed');
        if ((command.args ?? []).length > 64) throw new Error('too_many_arguments');
        const cwd = validateWorkspacePath(command.cwd ?? '/workspace');
        const timeout = Math.min(Math.max(command.timeoutMs ?? 120_000, 1_000), 300_000);
        const shellCommand = `cd ${quoteShell(cwd)} && exec ${quoteShell(command.executable)} ${(command.args ?? []).map(quoteShell).join(' ')}`;
        const result = await sandbox.exec(shellCommand, { timeout });
        return json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, success: result.success });
      }

      if (url.pathname === '/v1/sandboxes/process/start') {
        const command = input as unknown as StartProcessRequest;
        if (!allowedExecutables.has(command.executable) || !Array.isArray(command.args ?? [])) throw new Error('command_not_allowed');
        if ((command.args ?? []).length > 64) throw new Error('too_many_arguments');
        if (command.port !== undefined && (!Number.isInteger(command.port) || command.port < 1024 || command.port > 65535)) {
          throw new Error('invalid_port');
        }
        const cwd = validateWorkspacePath(command.cwd ?? '/workspace');
        const shellCommand = `cd ${quoteShell(cwd)} && exec ${quoteShell(command.executable)} ${(command.args ?? []).map(quoteShell).join(' ')}`;
        const process = await sandbox.startProcess(shellCommand, { autoCleanup: false });
        if (command.port !== undefined) {
          await process.waitForPort(command.port, { mode: 'tcp', timeout: Math.min(Math.max(command.timeoutMs ?? 120_000, 1_000), 300_000) });
        }
        return json({ processId: process.id, status: process.status, pid: process.pid ?? null }, 201);
      }

      if (url.pathname === '/v1/sandboxes/process/kill') {
        const processId = String(input.processId ?? '');
        if (!identifierPattern.test(processId)) throw new Error('invalid_process_id');
        await sandbox.killProcess(processId);
        return json({ processId, status: 'killed' });
      }

      if (url.pathname === '/v1/sandboxes/write') {
        const path = validateWorkspacePath(String(input.path ?? ''));
        const content = String(input.content ?? '');
        if (content.length > 2_000_000) throw new Error('payload_too_large');
        await sandbox.writeFile(path, content);
        return json({ ok: true }, 201);
      }

      if (url.pathname === '/v1/sandboxes/read') {
        const path = validateWorkspacePath(String(input.path ?? ''));
        const result = await sandbox.readFile(path, { encoding: 'utf-8' });
        return json({ path, content: result.content });
      }

      if (url.pathname === '/v1/sandboxes/delete') {
        const path = validateWorkspacePath(String(input.path ?? ''));
        await sandbox.deleteFile(path);
        return json({ path, deleted: true });
      }

      if (url.pathname === '/v1/sandboxes/preview') {
        const port = Number(input.port ?? 8080);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_port');
        const tunnel = await retry(() => sandbox.tunnels.get(port));
        return json({ url: tunnel.url, port, expiresWithSandbox: true });
      }

      if (url.pathname === '/v1/sandboxes/destroy') {
        await sandbox.destroy();
        return json({ ok: true });
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'sandbox_error';
      const clientErrors = ['invalid_json', 'invalid_scope', 'sandbox_scope_mismatch', 'command_not_allowed', 'too_many_arguments', 'invalid_argument', 'path_outside_workspace', 'payload_too_large', 'invalid_port', 'invalid_process_id'];
      return json({ error: message }, clientErrors.includes(message) ? 400 : 500);
    }
  },
} satisfies ExportedHandler<Env>;
