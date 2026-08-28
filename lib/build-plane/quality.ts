import type { BuildEvidence, QualityCheckKind, QualityCheckResult } from './contracts';

const requiredChecks: QualityCheckKind[] = ['typecheck', 'lint', 'unit', 'integration', 'e2e', 'accessibility'];

export function evaluateReleaseEvidence(results: QualityCheckResult[], evidence: BuildEvidence[]) {
  const latest = new Map<QualityCheckKind, QualityCheckResult>();
  for (const result of results) latest.set(result.kind, result);
  const missing = requiredChecks.filter((kind) => !latest.has(kind));
  const failed = requiredChecks.filter((kind) => latest.get(kind)?.status === 'failed');
  const skipped = requiredChecks.filter((kind) => latest.get(kind)?.status === 'skipped');
  const unverified = evidence.filter((item) => item.status !== 'verified' || item.artifactIds.length === 0).map((item) => item.id);
  return {
    releasable: missing.length === 0 && failed.length === 0 && skipped.length === 0 && unverified.length === 0,
    missing,
    failed,
    skipped,
    unverified,
  };
}
