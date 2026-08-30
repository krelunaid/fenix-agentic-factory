export type ProvenanceMaterial = { path: string; sha256: string };

export type FenixProvenance = {
  format: 'fenix-provenance-v1';
  subject: { projectId: string; jobId: string; sourceArtifactId: string; sourceArtifactSha256: string; sourceTreeRoot: string };
  build: { promptSha256: string; models: Array<{ provider: string; model: string; callId: string }>; quality: Array<{ kind: string; status: string; evidenceArtifactId: string; evidenceSha256: string }> };
  materials: ProvenanceMaterial[];
  generatedAt: number;
};

const encoder = new TextEncoder();

export async function provenanceSha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sourceMaterials(files: Array<{ path: string; content: string }>) {
  const materials = await Promise.all(files.map(async (file) => ({ path: file.path, sha256: await provenanceSha256(file.content) })));
  return materials.sort((left, right) => left.path.localeCompare(right.path));
}

export async function sourceTreeRoot(materials: ProvenanceMaterial[]) {
  return provenanceSha256([...materials].sort((left, right) => left.path.localeCompare(right.path)).map((file) => `${file.path}\0${file.sha256}`).join('\n'));
}

export async function createProvenance(input: {
  projectId: string;
  jobId: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  prompt: string;
  files: Array<{ path: string; content: string }>;
  models: Array<{ provider: string; model: string; callId: string }>;
  quality: Array<{ kind: string; status: string; evidenceArtifactId: string; evidenceSha256: string }>;
  generatedAt: number;
}): Promise<FenixProvenance> {
  const materials = await sourceMaterials(input.files);
  return {
    format: 'fenix-provenance-v1',
    subject: { projectId: input.projectId, jobId: input.jobId, sourceArtifactId: input.sourceArtifactId, sourceArtifactSha256: input.sourceArtifactSha256, sourceTreeRoot: await sourceTreeRoot(materials) },
    build: { promptSha256: await provenanceSha256(input.prompt), models: [...input.models].sort((left, right) => left.callId.localeCompare(right.callId)), quality: [...input.quality].sort((left, right) => left.kind.localeCompare(right.kind)) },
    materials,
    generatedAt: input.generatedAt,
  };
}

export async function verifyProvenance(statement: FenixProvenance, files: Array<{ path: string; content: string }>) {
  if (statement.format !== 'fenix-provenance-v1') return false;
  const materials = await sourceMaterials(files);
  return JSON.stringify(materials) === JSON.stringify(statement.materials) && await sourceTreeRoot(materials) === statement.subject.sourceTreeRoot;
}

export const offlineProvenanceVerifier = `import { readFile } from 'node:fs/promises';\nimport { createHash } from 'node:crypto';\nconst sha=value=>createHash('sha256').update(value).digest('hex');\nconst statement=JSON.parse(await readFile(new URL('./provenance.json',import.meta.url),'utf8'));\nconst materials=[];\nfor(const item of statement.materials){const content=await readFile(new URL('../'+item.path,import.meta.url));materials.push({path:item.path,sha256:sha(content)});}\nmaterials.sort((a,b)=>a.path.localeCompare(b.path));\nconst root=sha(materials.map(item=>item.path+'\\0'+item.sha256).join('\\n'));\nif(JSON.stringify(materials)!==JSON.stringify(statement.materials)||root!==statement.subject.sourceTreeRoot){console.error('FENIX provenance: FAILED');process.exit(1);}\nconsole.log('FENIX provenance: VERIFIED '+root);\n`;
