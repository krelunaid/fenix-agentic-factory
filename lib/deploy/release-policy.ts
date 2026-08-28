export type ReleaseGateInput = {
  environment: 'preview' | 'staging' | 'production';
  artifactSha256: string;
  qualityReleasable: boolean;
  smokePassed: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  previousProductionReleaseId?: string;
};

export function evaluateReleaseGate(input: ReleaseGateInput) {
  const reasons: string[] = [];
  if (!/^[a-f0-9]{64}$/.test(input.artifactSha256)) reasons.push('invalid_artifact_hash');
  if (!input.qualityReleasable) reasons.push('quality_gate_failed');
  if (!input.smokePassed) reasons.push('smoke_test_failed');
  if (input.environment === 'production' && input.approvalStatus !== 'approved') reasons.push('production_approval_required');
  if (input.environment === 'production' && !input.previousProductionReleaseId) reasons.push('rollback_target_required');
  return { allowed: reasons.length === 0, reasons };
}

export function validateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (normalized.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) throw new Error('invalid_hostname');
  return normalized;
}
