const forbiddenSecretFiles = [/^\.env(?:\.|$)/, /\.pem$/i, /\.p12$/i, /id_rsa$/i, /service-account.*\.json$/i];

export function validatePushPlan(input: { branch: string; force: boolean; files: string[]; protectedBranches: string[] }) {
  if (input.force) throw new Error('force_push_forbidden');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,199}$/.test(input.branch) || input.branch.includes('..')) throw new Error('invalid_branch');
  if (input.protectedBranches.includes(input.branch)) throw new Error('protected_branch_requires_pull_request');
  const secretFiles = input.files.filter((path) => forbiddenSecretFiles.some((pattern) => pattern.test(path.split('/').at(-1) ?? path)));
  if (secretFiles.length) throw new Error(`secret_files_forbidden:${secretFiles.join(',')}`);
  return { branch: input.branch, files: [...new Set(input.files)].sort(), force: false as const };
}

export function createPullRequestSummary(input: { title: string; checks: Array<{ kind: string; status: string; artifactId?: string }>; changedFiles: string[] }) {
  const failed = input.checks.filter((check) => check.status !== 'passed');
  return {
    title: input.title.slice(0, 200),
    changedFiles: input.changedFiles.length,
    checks: input.checks,
    mergeReady: failed.length === 0 && input.checks.length > 0 && input.checks.every((check) => Boolean(check.artifactId)),
  };
}
