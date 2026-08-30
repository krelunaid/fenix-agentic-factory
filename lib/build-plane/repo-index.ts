export type RepositoryFile = {
  path: string;
  byteSize: number;
  sha256: string;
  language: string;
  generated: boolean;
};

const generatedSegments = new Set(['node_modules', '.next', '.vinext', 'dist', 'coverage', '.git']);

export function normalizeRepositoryPath(input: string) {
  const normalized = input.normalize('NFKC').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  const segments = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || /[\u0000-\u001f\u007f]/.test(normalized) || segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('path_outside_repository');
  }
  return normalized;
}

export function isGeneratedPath(input: string) {
  const path = normalizeRepositoryPath(input);
  return path.split('/').some((segment) => generatedSegments.has(segment));
}

export function detectLanguage(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React',
    css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', md: 'Markdown', sql: 'SQL',
    py: 'Python', go: 'Go', rs: 'Rust', swift: 'Swift', kt: 'Kotlin', java: 'Java',
  };
  return languages[extension ?? ''] ?? 'Text';
}

export function buildRepositoryIndex(files: Array<Omit<RepositoryFile, 'language' | 'generated'>>) {
  const seen = new Set<string>();
  return files.map((file) => {
    const path = normalizeRepositoryPath(file.path);
    if (seen.has(path)) throw new Error(`duplicate_path:${path}`);
    seen.add(path);
    return { ...file, path, language: detectLanguage(path), generated: isGeneratedPath(path) };
  });
}
