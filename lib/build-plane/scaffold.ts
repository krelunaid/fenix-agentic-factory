import { normalizeRepositoryPath } from './repo-index';

export type ScaffoldManifest = {
  templateVersion: string;
  runtime: 'cloudflare-workers';
  packageManager: 'pnpm';
  healthPath: string;
  requiredFiles: string[];
  qualityCommands: Record<'typecheck' | 'lint' | 'unit' | 'build', string[]>;
};

export function validateScaffoldManifest(manifest: ScaffoldManifest, availableFiles: string[]) {
  if (!/^\d+\.\d+\.\d+$/.test(manifest.templateVersion)) throw new Error('invalid_template_version');
  if (!manifest.healthPath.startsWith('/')) throw new Error('invalid_health_path');
  const files = new Set(availableFiles.map(normalizeRepositoryPath));
  const missing = manifest.requiredFiles.map(normalizeRepositoryPath).filter((path) => !files.has(path));
  const commands = Object.values(manifest.qualityCommands);
  if (commands.some((command) => command.length === 0 || command.some((part) => !part))) throw new Error('invalid_quality_command');
  return { valid: missing.length === 0, missing };
}

export function createScaffoldPlan(manifest: ScaffoldManifest) {
  return [
    { id: 'install', executable: 'pnpm', args: ['install', '--frozen-lockfile'], dependsOn: [] },
    { id: 'typecheck', executable: manifest.qualityCommands.typecheck[0], args: manifest.qualityCommands.typecheck.slice(1), dependsOn: ['install'] },
    { id: 'lint', executable: manifest.qualityCommands.lint[0], args: manifest.qualityCommands.lint.slice(1), dependsOn: ['install'] },
    { id: 'unit', executable: manifest.qualityCommands.unit[0], args: manifest.qualityCommands.unit.slice(1), dependsOn: ['install'] },
    { id: 'build', executable: manifest.qualityCommands.build[0], args: manifest.qualityCommands.build.slice(1), dependsOn: ['typecheck', 'lint', 'unit'] },
  ];
}
