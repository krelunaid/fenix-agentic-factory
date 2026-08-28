export type ProjectRole = 'owner' | 'admin' | 'builder' | 'reviewer' | 'viewer';
export type ProjectAction = 'read' | 'build' | 'comment' | 'approve' | 'manage_members' | 'deploy_production';

const permissions: Record<ProjectRole, ProjectAction[]> = {
  owner: ['read', 'build', 'comment', 'approve', 'manage_members', 'deploy_production'],
  admin: ['read', 'build', 'comment', 'approve', 'manage_members', 'deploy_production'],
  builder: ['read', 'build', 'comment'],
  reviewer: ['read', 'comment', 'approve'],
  viewer: ['read'],
};

export function canProjectRole(role: ProjectRole, action: ProjectAction) {
  return permissions[role].includes(action);
}

export function optimisticCommentUpdate(input: { expectedUpdatedAt: number; currentUpdatedAt: number }) {
  if (input.expectedUpdatedAt !== input.currentUpdatedAt) throw new Error('concurrent_update_conflict');
  return true;
}
