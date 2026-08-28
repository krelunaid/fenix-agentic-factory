export type CreditEntry = { kind: 'grant' | 'usage' | 'topup' | 'refund' | 'adjustment'; credits: number; idempotencyKey: string };

export function creditBalance(entries: CreditEntry[]) {
  const seen = new Set<string>();
  return entries.reduce((balance, entry) => {
    if (seen.has(entry.idempotencyKey)) throw new Error('duplicate_credit_entry');
    seen.add(entry.idempotencyKey);
    if (!Number.isFinite(entry.credits) || entry.credits < 0) throw new Error('invalid_credit_amount');
    return balance + (entry.kind === 'usage' ? -entry.credits : entry.credits);
  }, 0);
}

export function authorizeCreditUsage(entries: CreditEntry[], requested: number, hardCap: number) {
  if (!Number.isFinite(requested) || requested <= 0 || !Number.isFinite(hardCap) || hardCap < 0) throw new Error('invalid_credit_request');
  const balance = creditBalance(entries);
  return { allowed: requested <= balance && requested <= hardCap, balance, requested, remaining: Math.max(0, balance - requested) };
}

export function reconcileProviderUsage(internalAmount: number, providerAmount: number, tolerance = 0.01) {
  const variance = providerAmount - internalAmount;
  return { variance, reconciled: Math.abs(variance) <= tolerance };
}
