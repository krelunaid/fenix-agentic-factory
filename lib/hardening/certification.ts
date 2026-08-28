export type CertificationResult = { scenario: string; runNumber: number; status: 'passed' | 'failed' | 'blocked' | 'not_run'; evidenceIds: string[]; blocker?: string };

export function evaluateBetaCertification(results: CertificationResult[], requiredScenarios = Array.from({ length: 15 }, (_, index) => `C${index + 1}`)) {
  const missing: string[] = [];
  const failed: string[] = [];
  for (const scenario of requiredScenarios) {
    const runs = results.filter((result) => result.scenario === scenario);
    for (let run = 1; run <= 3; run += 1) {
      const result = runs.find((item) => item.runNumber === run);
      if (!result) missing.push(`${scenario}:${run}`);
      else if (result.status !== 'passed' || result.evidenceIds.length === 0) failed.push(`${scenario}:${run}`);
    }
  }
  return { certified: missing.length === 0 && failed.length === 0, missing, failed };
}
