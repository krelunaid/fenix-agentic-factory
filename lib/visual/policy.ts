import { normalizeRepositoryPath } from '../build-plane/repo-index';

export function validateVisualSelection(input: { selector: string; sourcePath?: string; sourceLine?: number; frozenPaths: string[] }) {
  if (!input.selector || input.selector.length > 1000) throw new Error('invalid_selector');
  if (!input.sourcePath) return { patchable: false, reason: 'source_mapping_missing' };
  const sourcePath = normalizeRepositoryPath(input.sourcePath);
  if (input.frozenPaths.some((path) => sourcePath === path || sourcePath.startsWith(`${path}/`))) return { patchable: false, reason: 'source_frozen', sourcePath };
  if (!Number.isInteger(input.sourceLine) || (input.sourceLine ?? 0) < 1) return { patchable: false, reason: 'source_line_missing', sourcePath };
  return { patchable: true, sourcePath, sourceLine: input.sourceLine };
}

export function validateDesignTokens(tokens: Record<string, unknown>) {
  const allowed = new Set(['color', 'space', 'font', 'radius', 'shadow', 'breakpoint']);
  const invalid = Object.keys(tokens).filter((key) => ![...allowed].some((prefix) => key === prefix || key.startsWith(`${prefix}.`)));
  return { valid: invalid.length === 0 && Object.keys(tokens).length > 0, invalid };
}
