import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceTar, parseExportableSourceBundle, sourceArchiveName } from '../lib/source-export';

test('source export validates files and refuses secret-bearing paths', () => {
  assert.deepEqual(parseExportableSourceBundle({ files: [{ path: 'src/App.tsx', content: 'export default 1' }] }), [{ path: 'src/App.tsx', content: 'export default 1' }]);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: '.env', content: 'TOKEN=x' }] }), /source_bundle_protected_path/);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: 'config/.ENV.production', content: 'TOKEN=x' }] }), /source_bundle_protected_path/);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: 'src/.git/config', content: 'x' }] }), /source_bundle_protected_path/);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: '../escape', content: 'x' }] }), /path_outside_repository/);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: 'C:\\escape', content: 'x' }] }), /path_outside_repository/);
  assert.throws(() => parseExportableSourceBundle({ files: [{ path: 'src/evil\0name', content: 'x' }] }), /path_outside_repository/);
});

test('source export creates a valid ustar archive with deterministic names', () => {
  const archive = createSourceTar([{ path: 'src/App.tsx', content: 'hello' }], 'Fénix CRM', 1_700_000_000_000);
  assert.equal(new TextDecoder().decode(archive.subarray(0, 100)).replace(/\0+$/, ''), 'fenix-crm/src/App.tsx');
  assert.equal(new TextDecoder().decode(archive.subarray(257, 263)), 'ustar\0');
  assert.equal(new TextDecoder().decode(archive.subarray(512, 517)), 'hello');
  assert.equal(sourceArchiveName('Fénix CRM'), 'fenix-crm-source.tar');
  assert.equal(archive.byteLength % 512, 0);
});
