import assert from 'node:assert/strict';
import test from 'node:test';
import { pushFilesToGitHub } from '../lib/source-control/github';

test('GitHub source adapter creates blobs, a tree, a commit and a non-force ref update', async () => {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const shas = { parent: 'a'.repeat(40), baseTree: 'b'.repeat(40), blob: 'c'.repeat(40), tree: 'd'.repeat(40), commit: 'e'.repeat(40) };
  const fetcher: typeof fetch = async (request, init) => {
    const url = String(request); const method = init?.method ?? 'GET'; const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ url, method, body });
    const payload = url.includes('/git/ref/') ? { object: { sha: shas.parent } }
      : method === 'GET' ? { tree: { sha: shas.baseTree } }
        : url.endsWith('/git/blobs') ? { sha: shas.blob }
          : url.endsWith('/git/trees') ? { sha: shas.tree }
            : url.endsWith('/git/commits') ? { sha: shas.commit }
              : { ref: 'updated' };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await pushFilesToGitHub({ token: 'secret', repository: 'owner/repo', branch: 'fenix/change', files: [{ path: 'src/app.ts', content: 'ok' }], baseRevision: shas.parent, message: 'FENIX export' }, fetcher);
  assert.equal(result.headRevision, shas.commit);
  assert.equal(calls.at(-1)?.method, 'PATCH');
  assert.deepEqual(calls.at(-1)?.body, { sha: shas.commit, force: false });
  await assert.rejects(() => pushFilesToGitHub({ token: 'secret', repository: 'owner/repo', branch: 'main', files: [{ path: 'x', content: 'x' }], baseRevision: 'f'.repeat(40), message: 'x' }, fetcher), /source_revision_conflict/);
});
