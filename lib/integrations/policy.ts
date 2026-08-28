const secretKeyPattern = /(authorization|api[-_]?key|token|secret|password|cookie|private[-_]?key)/i;
const secretValuePattern = /\b(sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._~-]{12,})\b/g;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, secretKeyPattern.test(key) ? '[REDACTED]' : redactSecrets(nested)]));
  }
  if (typeof value === 'string') return value.replace(secretValuePattern, '[REDACTED]');
  return value;
}

export function requiresApproval(kind: string, action: string) {
  const risky = new Set(['payment.charge', 'email.send_external', 'webhook.write', 'storage.delete', 'database.migrate', 'deploy.production', 'domain.update']);
  return risky.has(`${kind}.${action}`);
}

export function validateIdempotencyKey(value: string) {
  if (!/^[a-zA-Z0-9:_-]{16,200}$/.test(value)) throw new Error('invalid_idempotency_key');
  return value;
}
