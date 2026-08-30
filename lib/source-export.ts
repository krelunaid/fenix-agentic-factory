import { normalizeRepositoryPath } from './build-plane/repo-index';

export type ExportableSourceFile = { path: string; content: string };

const encoder = new TextEncoder();
function isProtectedExportPath(path: string) {
  return path.split('/').some((segment) => {
    const normalized = segment.toLowerCase();
    return normalized === '.git' || normalized === '.dev.vars' || normalized === '.env' || normalized.startsWith('.env.');
  });
}

export function parseExportableSourceBundle(value: unknown): ExportableSourceFile[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('source_bundle_invalid');
  const files = (value as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0 || files.length > 500) throw new Error('source_bundle_files_invalid');
  const seen = new Set<string>();
  let totalBytes = 0;
  return files.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('source_bundle_file_invalid');
    const raw = candidate as { path?: unknown; content?: unknown };
    if (typeof raw.path !== 'string' || typeof raw.content !== 'string') throw new Error('source_bundle_file_invalid');
    const path = normalizeRepositoryPath(raw.path);
    if (isProtectedExportPath(path)) throw new Error('source_bundle_protected_path');
    if (seen.has(path)) throw new Error('source_bundle_duplicate_path');
    seen.add(path);
    totalBytes += encoder.encode(raw.content).byteLength;
    if (totalBytes > 10_000_000) throw new Error('source_bundle_too_large');
    return { path, content: raw.content };
  });
}

export function sourceArchiveName(projectName: string) {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'fenix-project'}-source.tar`;
}

function writeAscii(target: Uint8Array, offset: number, length: number, value: string) {
  const bytes = encoder.encode(value);
  if (bytes.length > length) throw new Error('tar_field_too_long');
  target.set(bytes, offset);
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  const encoded = Math.max(0, Math.floor(value)).toString(8).padStart(length - 2, '0');
  writeAscii(target, offset, length, `${encoded}\0`);
}

function tarPath(path: string) {
  if (encoder.encode(path).length <= 100) return { name: path, prefix: '' };
  const candidates = [...path.matchAll(/\//g)].map((match) => match.index ?? -1).reverse();
  for (const split of candidates) {
    const prefix = path.slice(0, split);
    const name = path.slice(split + 1);
    if (encoder.encode(prefix).length <= 155 && encoder.encode(name).length <= 100) return { name, prefix };
  }
  throw new Error(`source_bundle_path_too_long:${path}`);
}

function tarEntry(path: string, content: string, modifiedAtSeconds: number) {
  const body = encoder.encode(content);
  const entry = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
  const header = entry.subarray(0, 512);
  const split = tarPath(path);
  writeAscii(header, 0, 100, split.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, body.length);
  writeOctal(header, 136, 12, modifiedAtSeconds);
  header.fill(0x20, 148, 156);
  writeAscii(header, 156, 1, '0');
  writeAscii(header, 257, 6, 'ustar\0');
  writeAscii(header, 263, 2, '00');
  writeAscii(header, 345, 155, split.prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  entry.set(body, 512);
  return entry;
}

export function createSourceTar(files: ExportableSourceFile[], projectName: string, modifiedAtMs: number) {
  const root = sourceArchiveName(projectName).replace(/-source\.tar$/, '');
  const entries = files.map((file) => tarEntry(`${root}/${file.path}`, file.content, Math.floor(modifiedAtMs / 1_000)));
  const archive = new Uint8Array(entries.reduce((sum, entry) => sum + entry.byteLength, 1_024));
  let offset = 0;
  for (const entry of entries) {
    archive.set(entry, offset);
    offset += entry.byteLength;
  }
  return archive;
}
