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

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_conversations_project_updated').on(table.projectId, table.updatedAt)]);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: ['complete', 'streaming', 'failed'] }).notNull().default('complete'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_messages_conversation_created').on(table.conversationId, table.createdAt)]);

export const sandboxSessions = sqliteTable('sandbox_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  status: text('status', { enum: ['requested', 'provisioning', 'ready', 'failed', 'destroyed'] }).notNull(),
  constraintsJson: text('constraints_json').notNull().default('{}'),
  leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_sandboxes_job_status').on(table.jobId, table.status)]);

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  taskId: text('task_id').references(() => tasks.id),
  kind: text('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  sha256: text('sha256').notNull(),
  byteSize: integer('byte_size').notNull(),
  mediaType: text('media_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_artifacts_storage_key').on(table.storageKey), index('idx_artifacts_job_kind').on(table.jobId, table.kind)]);

export const previewSessions = sqliteTable('preview_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  sandboxId: text('sandbox_id').notNull().references(() => sandboxSessions.id),
  url: text('url'),
  port: integer('port').notNull(),
  status: text('status', { enum: ['starting', 'ready', 'failed', 'expired'] }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_previews_job_status').on(table.jobId, table.status)]);

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  provider: text('provider').notNull(),
  externalRef: text('external_ref'),
  defaultBranch: text('default_branch').notNull().default('main'),
  headRevision: text('head_revision'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_repositories_project').on(table.projectId)]);

export const repositoryFiles = sqliteTable('repository_files', {
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  path: text('path').notNull(),
  sha256: text('sha256').notNull(),
  byteSize: integer('byte_size').notNull(),
  language: text('language').notNull(),
  generated: integer('generated', { mode: 'boolean' }).notNull().default(false),
  indexedAt: integer('indexed_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_repository_files_path').on(table.repositoryId, table.path), index('idx_repository_files_language').on(table.repositoryId, table.language)]);

export const recoveryPoints = sqliteTable('recovery_points', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  parentId: text('parent_id'),
  sourceRevision: text('source_revision').notNull(),
  artifactId: text('artifact_id').notNull().references(() => artifacts.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_recovery_job_created').on(table.jobId, table.createdAt)]);

export const qualityRuns = sqliteTable('quality_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  taskId: text('task_id').references(() => tasks.id),
  kind: text('kind').notNull(),
  status: text('status', { enum: ['running', 'passed', 'failed', 'skipped'] }).notNull(),
  summary: text('summary').notNull().default(''),
  durationMs: integer('duration_ms'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_quality_runs_job_kind').on(table.jobId, table.kind)]);

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  qualityRunId: text('quality_run_id').notNull().references(() => qualityRuns.id),
  artifactId: text('artifact_id').references(() => artifacts.id),
  claim: text('claim').notNull(),
  status: text('status', { enum: ['verified', 'failed', 'unverified'] }).notNull(),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_evidence_quality_run').on(table.qualityRunId)]);

export const defects = sqliteTable('defects', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  qualityRunId: text('quality_run_id').references(() => qualityRuns.id),
  severity: text('severity', { enum: ['critical', 'high', 'medium', 'low'] }).notNull(),
  status: text('status', { enum: ['open', 'triaged', 'fixing', 'resolved', 'accepted'] }).notNull(),
  title: text('title').notNull(),
  details: text('details').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_defects_job_status').on(table.jobId, table.status)]);
