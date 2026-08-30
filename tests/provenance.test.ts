import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvenance, offlineProvenanceVerifier, verifyProvenance } from '../lib/provenance';

test('provenance binds prompt, source tree, models and independent evidence', async () => {
  const files = [{ path: 'src/a.ts', content: 'export const a=1' }, { path: 'src/b.ts', content: 'export const b=2' }];
  const statement = await createProvenance({ projectId: 'project', jobId: 'job', sourceArtifactId: 'source', sourceArtifactSha256: 'a'.repeat(64), prompt: 'build a CRM', files, models: [{ provider: 'xai', model: 'grok-4.6', callId: 'call-1' }], quality: [{ kind: 'unit', status: 'passed', evidenceArtifactId: 'evidence', evidenceSha256: 'b'.repeat(64) }], generatedAt: 1 });
  assert.equal(await verifyProvenance(statement, files), true);
  assert.equal(await verifyProvenance(statement, [{ ...files[0], content: 'tampered' }, files[1]]), false);
  assert.match(offlineProvenanceVerifier, /FENIX provenance: VERIFIED/);
});
