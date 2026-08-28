import type { BuildScope, SandboxCommand, SandboxExecutionResult } from './contracts';
import { deriveSandboxId } from './sandbox-id';

type SandboxAction = 'exec' | 'write' | 'read' | 'delete' | 'preview' | 'destroy' | 'process/start' | 'process/kill';

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedFetch(baseUrl: string, secret: string, action: SandboxAction, payload: object) {
  const path = `/v1/sandboxes/${action}`;
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const encoder = new TextEncoder();
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)));
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fenix-timestamp': timestamp, 'x-fenix-signature': `v1=${signature}` },
    body,
  });
  const result = await response.json().catch(() => ({ error: 'invalid_provider_response' })) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `sandbox_provider_${response.status}`);
  return result;
}

export function createSandboxClient(baseUrl: string, secret: string) {
  if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/localhost(?::\d+)?/.test(baseUrl)) throw new Error('invalid_sandbox_provider_url');
  if (secret.length < 32) throw new Error('invalid_sandbox_secret');
  return {
    async exec(scope: BuildScope, command: SandboxCommand) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'exec', { scope, sandboxId, ...command }) as unknown as Promise<SandboxExecutionResult>;
    },
    async writeFile(scope: BuildScope, path: string, content: string) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'write', { scope, sandboxId, path, content });
    },
    async readFile(scope: BuildScope, path: string) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'read', { scope, sandboxId, path }) as Promise<{ path: string; content: string }>;
    },
    async deleteFile(scope: BuildScope, path: string) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'delete', { scope, sandboxId, path });
    },
    async preview(scope: BuildScope, port = 8080) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'preview', { scope, sandboxId, port }) as Promise<{ url: string; port: number; expiresWithSandbox: boolean }>;
    },
    async startProcess(scope: BuildScope, command: SandboxCommand, port?: number) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'process/start', { scope, sandboxId, ...command, port }) as unknown as Promise<{ processId: string; status: string; pid: number | null }>;
    },
    async killProcess(scope: BuildScope, processId: string) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'process/kill', { scope, sandboxId, processId });
    },
    async destroy(scope: BuildScope) {
      const sandboxId = await deriveSandboxId(scope);
      return signedFetch(baseUrl, secret, 'destroy', { scope, sandboxId });
    },
  };
}
