import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb() {
  if (!env.DB) throw new Error('Cloudflare D1 binding DB is unavailable.');
  return drizzle(env.DB, { schema });
}

export async function ensureCoreSchema() {
  const db = env.DB;
  if (!db) throw new Error('Cloudflare D1 binding DB is unavailable.');
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)'),
    db.prepare('CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)'),
    db.prepare('CREATE TABLE IF NOT EXISTS organization_members (organization_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (organization_id) REFERENCES organizations(id), FOREIGN KEY (user_id) REFERENCES users(id))'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_org_user ON organization_members(organization_id,user_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id)'),
    db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, tone TEXT NOT NULL DEFAULT 'violet', created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (organization_id) REFERENCES organizations(id), FOREIGN KEY (created_by) REFERENCES users(id))"),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects(organization_id,updated_at)'),
    db.prepare("CREATE TABLE IF NOT EXISTS specifications (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, version INTEGER NOT NULL, objective TEXT NOT NULL, assumptions_json TEXT NOT NULL DEFAULT '[]', flows_json TEXT NOT NULL DEFAULT '[]', scenarios_json TEXT NOT NULL DEFAULT '[]', approved_at INTEGER, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (created_by) REFERENCES users(id))"),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_specifications_project_version ON specifications(project_id,version)'),
    db.prepare('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL, budget_limit REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)'),
    db.prepare("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, project_id TEXT NOT NULL, phase INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, risk_level TEXT NOT NULL DEFAULT 'low', idempotency_key TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY (job_id) REFERENCES jobs(id), FOREIGN KEY (project_id) REFERENCES projects(id))"),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks(idempotency_key)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_job_status ON tasks(job_id,status)'),
    db.prepare('CREATE TABLE IF NOT EXISTS task_dependencies (task_id TEXT NOT NULL, depends_on_task_id TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES tasks(id), FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id))'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_task_dependencies_pair ON task_dependencies(task_id,depends_on_task_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent ON task_dependencies(depends_on_task_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS task_attempts (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, attempt_number INTEGER NOT NULL, status TEXT NOT NULL, worker_id TEXT, error_code TEXT, started_at INTEGER NOT NULL, completed_at INTEGER, FOREIGN KEY (task_id) REFERENCES tasks(id))'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_task_attempts_number ON task_attempts(task_id,attempt_number)'),
    db.prepare('CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, job_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, decided_by TEXT, reason TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER, FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (job_id) REFERENCES jobs(id), FOREIGN KEY (requested_by) REFERENCES users(id), FOREIGN KEY (decided_by) REFERENCES users(id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_approvals_job_status ON approvals(job_id,status)'),
    db.prepare("CREATE TABLE IF NOT EXISTS build_events (id TEXT PRIMARY KEY NOT NULL, trace_id TEXT NOT NULL, project_id TEXT NOT NULL, job_id TEXT, task_id TEXT, type TEXT NOT NULL, severity TEXT NOT NULL, human_message TEXT NOT NULL, cost_delta REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id))"),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_build_events_project_created ON build_events(project_id,created_at)'),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, FOREIGN KEY (organization_id) REFERENCES organizations(id), FOREIGN KEY (actor_user_id) REFERENCES users(id))"),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(organization_id,created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS usage_ledger (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, project_id TEXT, task_id TEXT, kind TEXT NOT NULL, units REAL NOT NULL, amount REAL NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (organization_id) REFERENCES organizations(id), FOREIGN KEY (project_id) REFERENCES projects(id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_usage_org_created ON usage_ledger(organization_id,created_at)'),
  ]);
}
