import { isGeneratedPath, normalizeRepositoryPath } from './repo-index';

export type PatchOperation = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  expectedSha256?: string;
  contentSha256?: string;
};

export type PatchPolicy = {
  allowedGlobs: string[];
  frozenPaths: string[];
  maxFiles: number;
  allowDelete: boolean;
  allowGenerated: boolean;
};

function globMatches(path: string, glob: string) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\0')
    .replaceAll('*', '[^/]*')
    .replaceAll('\0', '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

export function validatePatch(operations: PatchOperation[], policy: PatchPolicy) {
  if (!operations.length) throw new Error('empty_patch');
  if (operations.length > policy.maxFiles) throw new Error('patch_too_large');
  const paths = new Set<string>();

  return operations.map((operation) => {
    const path = normalizeRepositoryPath(operation.path);
    if (paths.has(path)) throw new Error(`duplicate_operation:${path}`);
    paths.add(path);
    if (!policy.allowedGlobs.some((glob) => globMatches(path, glob))) throw new Error(`path_not_allowed:${path}`);
    if (policy.frozenPaths.some((frozen) => path === frozen || path.startsWith(`${frozen}/`))) throw new Error(`path_frozen:${path}`);
    if (!policy.allowGenerated && isGeneratedPath(path)) throw new Error(`generated_path:${path}`);
    if (!policy.allowDelete && operation.operation === 'delete') throw new Error(`delete_not_allowed:${path}`);
    if (operation.operation !== 'create' && !operation.expectedSha256) throw new Error(`missing_precondition:${path}`);
    if (operation.operation !== 'delete' && !operation.contentSha256) throw new Error(`missing_content_hash:${path}`);
    return { ...operation, path };
  });
}
