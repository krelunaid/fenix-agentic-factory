import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_users_email').on(table.email)]);

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_organizations_slug').on(table.slug)]);

export const organizationMembers = sqliteTable('organization_members', {
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'builder', 'viewer'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_org_members_org_user').on(table.organizationId, table.userId), index('idx_org_members_user').on(table.userId)]);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  status: text('status', { enum: ['Planning', 'Building', 'Review', 'Ready', 'Paused', 'Blocked'] }).notNull(),
  progress: integer('progress').notNull().default(0),
  tone: text('tone', { enum: ['violet', 'cyan', 'amber'] }).notNull().default('violet'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_projects_org_updated').on(table.organizationId, table.updatedAt)]);

export const specifications = sqliteTable('specifications', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  version: integer('version').notNull(),
  objective: text('objective').notNull(),
  assumptionsJson: text('assumptions_json').notNull().default('[]'),
  flowsJson: text('flows_json').notNull().default('[]'),
  scenariosJson: text('scenarios_json').notNull().default('[]'),
  approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_specifications_project_version').on(table.projectId, table.version)]);

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  status: text('status').notNull(),
  budgetLimit: real('budget_limit').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_jobs_project').on(table.projectId)]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  phase: integer('phase').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  priority: integer('priority').notNull().default(0),
  riskLevel: text('risk_level').notNull().default('low'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [uniqueIndex('idx_tasks_idempotency').on(table.idempotencyKey), index('idx_tasks_job_status').on(table.jobId, table.status)]);

export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: text('task_id').notNull().references(() => tasks.id),
  dependsOnTaskId: text('depends_on_task_id').notNull().references(() => tasks.id),
}, (table) => [uniqueIndex('idx_task_dependencies_pair').on(table.taskId, table.dependsOnTaskId), index('idx_task_dependencies_parent').on(table.dependsOnTaskId)]);

export const taskAttempts = sqliteTable('task_attempts', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  attemptNumber: integer('attempt_number').notNull(),
  status: text('status').notNull(),
  workerId: text('worker_id'),
  errorCode: text('error_code'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [uniqueIndex('idx_task_attempts_number').on(table.taskId, table.attemptNumber)]);

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').references(() => jobs.id),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  decidedBy: text('decided_by').references(() => users.id),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_approvals_job_status').on(table.jobId, table.status)]);

export const buildEvents = sqliteTable('build_events', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id'),
  taskId: text('task_id'),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  humanMessage: text('human_message').notNull(),
  costDelta: real('cost_delta').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_build_events_project_created').on(table.projectId, table.createdAt)]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_audit_org_created').on(table.organizationId, table.createdAt)]);

export const usageLedger = sqliteTable('usage_ledger', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  taskId: text('task_id'),
  kind: text('kind').notNull(),
  units: real('units').notNull(),
  amount: real('amount').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_usage_org_created').on(table.organizationId, table.createdAt)]);
