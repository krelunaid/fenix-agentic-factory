export type RecoveryPoint = {
  id: string;
  projectId: string;
  jobId: string;
  parentId: string | null;
  sourceRevision: string;
  artifactId: string;
  createdAt: number;
};

export function selectRollbackPath(points: RecoveryPoint[], fromId: string, targetId: string) {
  const byId = new Map(points.map((point) => [point.id, point]));
  const from = byId.get(fromId);
  const target = byId.get(targetId);
  if (!from || !target || from.projectId !== target.projectId || from.jobId !== target.jobId) throw new Error('invalid_recovery_scope');
  const path: RecoveryPoint[] = [];
  let cursor: RecoveryPoint | undefined = from;
  while (cursor && cursor.id !== target.id) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  if (!cursor) throw new Error('target_not_ancestor');
  path.push(cursor);
  return path;
}

export function forkRecoveryPoint(source: RecoveryPoint, id: string, jobId: string, createdAt: number): RecoveryPoint {
  if (!id || !jobId || jobId === source.jobId) throw new Error('invalid_fork');
  return { ...source, id, jobId, parentId: source.id, createdAt };
}
