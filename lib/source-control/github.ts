type Fetcher = typeof fetch;

type GitHubFile = { path: string; content: string };

function repositoryPath(value: string) {
  const repository = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('invalid_github_repository');
  return repository;
}

async function githubRequest(fetcher: Fetcher, token: string, path: string, init: RequestInit = {}) {
  const response = await fetcher(`https://api.github.com${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'FENIX-Control-Plane/2', 'x-github-api-version': '2022-11-28', ...(init.headers ?? {}) },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`github_source_sync_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function pushFilesToGitHub(input: { token: string; repository: string; branch: string; files: GitHubFile[]; baseRevision?: string; message: string }, fetcher: Fetcher = fetch) {
  const repository = repositoryPath(input.repository);
  const branch = input.branch.trim();
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) throw new Error('invalid_branch');
  if (!input.files.length || input.files.length > 500) throw new Error('invalid_source_files');
  const ref = await githubRequest(fetcher, input.token, `/repos/${repository}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
  const refObject = ref.object && typeof ref.object === 'object' ? ref.object as Record<string, unknown> : {};
  const parentSha = String(refObject.sha ?? '');
  if (!/^[a-f0-9]{40}$/.test(parentSha)) throw new Error('github_ref_invalid');
  if (input.baseRevision && input.baseRevision !== parentSha) throw new Error('source_revision_conflict');
  const commit = await githubRequest(fetcher, input.token, `/repos/${repository}/git/commits/${parentSha}`);
  const treeObject = commit.tree && typeof commit.tree === 'object' ? commit.tree as Record<string, unknown> : {};
  const baseTree = String(treeObject.sha ?? '');
  if (!/^[a-f0-9]{40}$/.test(baseTree)) throw new Error('github_tree_invalid');
  const entries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const file of input.files) {
    const blob = await githubRequest(fetcher, input.token, `/repos/${repository}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: file.content, encoding: 'utf-8' }) });
    const sha = String(blob.sha ?? '');
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('github_blob_invalid');
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha });
  }
  const tree = await githubRequest(fetcher, input.token, `/repos/${repository}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: entries }) });
  const treeSha = String(tree.sha ?? '');
  if (!/^[a-f0-9]{40}$/.test(treeSha)) throw new Error('github_tree_invalid');
  const nextCommit = await githubRequest(fetcher, input.token, `/repos/${repository}/git/commits`, { method: 'POST', body: JSON.stringify({ message: input.message.slice(0, 200), tree: treeSha, parents: [parentSha] }) });
  const headRevision = String(nextCommit.sha ?? '');
  if (!/^[a-f0-9]{40}$/.test(headRevision)) throw new Error('github_commit_invalid');
  await githubRequest(fetcher, input.token, `/repos/${repository}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, { method: 'PATCH', body: JSON.stringify({ sha: headRevision, force: false }) });
  return { baseRevision: parentSha, headRevision, filesPushed: entries.length };
}
