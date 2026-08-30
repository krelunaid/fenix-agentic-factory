export type BuildScope = {
  organizationId: string;
  projectId: string;
  jobId: string;
};

export type SandboxCommand = {
  executable: 'node' | 'corepack' | 'pnpm' | 'npm' | 'git' | 'tsc' | 'eslint' | 'vitest' | 'playwright';
  args: string[];
  cwd: `/workspace${string}`;
  timeoutMs: number;
};

export type SandboxExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export type ArtifactKind = 'source_bundle' | 'generated_source_bundle' | 'provenance' | 'build_log' | 'test_report' | 'screenshot' | 'trace' | 'snapshot' | 'patch_snapshot' | 'project_snapshot';

export type ArtifactDescriptor = {
  id: string;
  projectId: string;
  jobId: string;
  taskId?: string;
  kind: ArtifactKind;
  storageKey: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
};

export type PreviewDescriptor = {
  id: string;
  sandboxId: string;
  url: string;
  port: number;
  status: 'starting' | 'ready' | 'failed' | 'expired';
  expiresAt: number;
};

export type QualityCheckKind = 'typecheck' | 'lint' | 'unit' | 'integration' | 'e2e' | 'accessibility' | 'visual';

export type QualityCheckResult = {
  kind: QualityCheckKind;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  artifactIds: string[];
  summary: string;
};

export type BuildEvidence = {
  id: string;
  checkKind: QualityCheckKind;
  claim: string;
  status: 'verified' | 'failed' | 'unverified';
  artifactIds: string[];
  createdAt: number;
};
