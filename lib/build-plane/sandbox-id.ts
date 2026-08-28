import type { BuildScope } from './contracts';

export async function deriveSandboxId(scope: BuildScope) {
  const value = `${scope.organizationId}:${scope.projectId}:${scope.jobId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `fnx-${hex.slice(0, 24)}`;
}
