import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { ensureCoreSchema } from '../db';

export async function requireProjectAccess(projectId: string) {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureCoreSchema();
  const membership = await env.DB.prepare('SELECT p.organization_id,COALESCE(pm.role,m.role) AS role FROM projects p LEFT JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=? LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? WHERE p.id=? AND (m.user_id IS NOT NULL OR pm.user_id IS NOT NULL) LIMIT 1').bind(user.userId, user.userId, projectId).first<{ organization_id: string; role: string }>();
  if (!membership) return null;
  return { user, organizationId: membership.organization_id, role: membership.role };
}

export async function requireJobAccess(jobId: string) {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureCoreSchema();
  const membership = await env.DB.prepare('SELECT j.id,j.project_id,j.status,j.budget_limit,p.organization_id,COALESCE(pm.role,m.role) AS role FROM jobs j JOIN projects p ON p.id=j.project_id LEFT JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=? LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? WHERE j.id=? AND (m.user_id IS NOT NULL OR pm.user_id IS NOT NULL) LIMIT 1').bind(user.userId, user.userId, jobId).first<{ id: string; project_id: string; status: string; budget_limit: number; organization_id: string; role: string }>();
  if (!membership) return null;
  return { user, job: membership };
}

export async function requireTaskAccess(taskId: string) {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureCoreSchema();
  const task = await env.DB.prepare('SELECT t.id,t.job_id,t.project_id,t.status,p.organization_id,COALESCE(pm.role,m.role) AS role FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=? LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? WHERE t.id=? AND (m.user_id IS NOT NULL OR pm.user_id IS NOT NULL) LIMIT 1').bind(user.userId, user.userId, taskId).first<{ id: string; job_id: string; project_id: string; status: string; organization_id: string; role: string }>();
  if (!task) return null;
  return { user, task };
}

export function canOperate(role: string) {
  return role === 'owner' || role === 'admin' || role === 'builder';
}
