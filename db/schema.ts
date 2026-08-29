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
  requiredApprovals: integer('required_approvals').notNull().default(1),
  requiredRejections: integer('required_rejections').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_approvals_job_status').on(table.jobId, table.status)]);

export const approvalVotes = sqliteTable('approval_votes', {
  approvalId: text('approval_id').notNull().references(() => approvals.id),
  userId: text('user_id').notNull().references(() => users.id),
  decision: text('decision', { enum: ['approved', 'rejected'] }).notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_approval_votes_pair').on(table.approvalId, table.userId), index('idx_approval_votes_approval').on(table.approvalId)]);

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

export const artifactBlobs = sqliteTable('artifact_blobs', {
  artifactId: text('artifact_id').primaryKey().references(() => artifacts.id),
  base64Data: text('base64_data').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

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

export const prototypeRecords = sqliteTable('prototype_records', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_prototype_records_project_created').on(table.projectId, table.createdAt)]);

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

export const modelCatalog = sqliteTable('model_catalog', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  capabilitiesJson: text('capabilities_json').notNull().default('[]'),
  inputCostPerMillion: real('input_cost_per_million').notNull(),
  outputCostPerMillion: real('output_cost_per_million').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_model_catalog_provider_model').on(table.provider, table.model)]);

export const aiCredentials = sqliteTable('ai_credentials', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  provider: text('provider').notNull(),
  mode: text('mode', { enum: ['managed', 'byok'] }).notNull(),
  secretRef: text('secret_ref').notNull(),
  status: text('status', { enum: ['active', 'invalid', 'revoked'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_ai_credentials_org_provider').on(table.organizationId, table.provider)]);

export const secretRecords = sqliteTable('secret_records', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_secret_records_org').on(table.organizationId, table.createdAt)]);

export const aiCalls = sqliteTable('ai_calls', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').references(() => jobs.id),
  taskId: text('task_id').references(() => tasks.id),
  modelCatalogId: text('model_catalog_id').notNull().references(() => modelCatalog.id),
  purpose: text('purpose').notNull(),
  status: text('status', { enum: ['estimated', 'running', 'completed', 'failed', 'blocked'] }).notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  estimatedCost: real('estimated_cost').notNull().default(0),
  actualCost: real('actual_cost'),
  fallbackFrom: text('fallback_from'),
  traceId: text('trace_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_ai_calls_project_created').on(table.projectId, table.createdAt), index('idx_ai_calls_job_status').on(table.jobId, table.status)]);

export const providerConnections = sqliteTable('provider_connections', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  kind: text('kind').notNull(),
  provider: text('provider').notNull(),
  secretRef: text('secret_ref'),
  configJson: text('config_json').notNull().default('{}'),
  status: text('status', { enum: ['pending', 'healthy', 'degraded', 'revoked'] }).notNull(),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_provider_connections_org_kind').on(table.organizationId, table.kind)]);

export const integrationActions = sqliteTable('integration_actions', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => providerConnections.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  taskId: text('task_id').references(() => tasks.id),
  idempotencyKey: text('idempotency_key').notNull(),
  action: text('action').notNull(),
  riskLevel: text('risk_level').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'running', 'succeeded', 'failed', 'blocked'] }).notNull(),
  requestJson: text('request_json').notNull().default('{}'),
  responseJson: text('response_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [uniqueIndex('idx_integration_actions_idempotency').on(table.idempotencyKey), index('idx_integration_actions_project_status').on(table.projectId, table.status)]);

export const sourceConnections = sqliteTable('source_connections', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  provider: text('provider').notNull(),
  installationRef: text('installation_ref'),
  secretRef: text('secret_ref').notNull(),
  status: text('status', { enum: ['active', 'invalid', 'revoked'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_source_connections_org').on(table.organizationId, table.provider)]);

export const repositorySyncs = sqliteTable('repository_syncs', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  connectionId: text('connection_id').notNull().references(() => sourceConnections.id),
  direction: text('direction', { enum: ['import', 'push', 'pull', 'webhook'] }).notNull(),
  branch: text('branch').notNull(),
  baseRevision: text('base_revision'),
  headRevision: text('head_revision'),
  status: text('status', { enum: ['pending', 'running', 'succeeded', 'conflict', 'failed'] }).notNull(),
  conflictJson: text('conflict_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_repository_syncs_repo_created').on(table.repositoryId, table.createdAt)]);

export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  artifactId: text('artifact_id').notNull().references(() => artifacts.id),
  version: text('version').notNull(),
  status: text('status', { enum: ['candidate', 'staging', 'approved', 'production', 'rolled_back', 'failed'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_releases_project_version').on(table.projectId, table.version)]);

export const deploymentRecords = sqliteTable('deployment_records', {
  id: text('id').primaryKey(),
  releaseId: text('release_id').notNull().references(() => releases.id),
  connectionId: text('connection_id').notNull().references(() => providerConnections.id),
  environment: text('environment', { enum: ['preview', 'staging', 'production'] }).notNull(),
  providerRef: text('provider_ref'),
  url: text('url'),
  status: text('status', { enum: ['pending', 'building', 'ready', 'failed', 'rolled_back'] }).notNull(),
  healthJson: text('health_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_deployments_release_environment').on(table.releaseId, table.environment)]);

export const customDomains = sqliteTable('custom_domains', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  deploymentId: text('deployment_id').references(() => deploymentRecords.id),
  hostname: text('hostname').notNull(),
  status: text('status', { enum: ['pending_dns', 'verifying', 'active', 'failed', 'removed'] }).notNull(),
  dnsChallengeJson: text('dns_challenge_json').notNull().default('{}'),
  sslStatus: text('ssl_status').notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
}, (table) => [uniqueIndex('idx_custom_domains_hostname').on(table.hostname), index('idx_custom_domains_project').on(table.projectId)]);

export const mobileProfiles = sqliteTable('mobile_profiles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  platformJson: text('platform_json').notNull().default('["ios","android"]'),
  permissionsJson: text('permissions_json').notNull().default('[]'),
  bundleIdentifier: text('bundle_identifier').notNull(),
  status: text('status', { enum: ['draft', 'ready', 'invalid'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_mobile_profiles_project').on(table.projectId)]);

export const mobileBuilds = sqliteTable('mobile_builds', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  profileId: text('profile_id').notNull().references(() => mobileProfiles.id),
  artifactId: text('artifact_id').references(() => artifacts.id),
  platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
  channel: text('channel', { enum: ['development', 'preview', 'production'] }).notNull(),
  providerRef: text('provider_ref'),
  status: text('status', { enum: ['pending', 'building', 'ready', 'failed'] }).notNull(),
  qrUrl: text('qr_url'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_mobile_builds_project_created').on(table.projectId, table.createdAt)]);

export const billingAccounts = sqliteTable('billing_accounts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  provider: text('provider').notNull(),
  customerRef: text('customer_ref'),
  status: text('status', { enum: ['trial', 'active', 'past_due', 'paused', 'cancelled'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_billing_accounts_org').on(table.organizationId)]);

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  billingAccountId: text('billing_account_id').notNull().references(() => billingAccounts.id),
  plan: text('plan').notNull(),
  status: text('status', { enum: ['trialing', 'active', 'past_due', 'paused', 'cancelled'] }).notNull(),
  creditsIncluded: real('credits_included').notNull().default(0),
  periodStartsAt: integer('period_starts_at', { mode: 'timestamp_ms' }).notNull(),
  periodEndsAt: integer('period_ends_at', { mode: 'timestamp_ms' }).notNull(),
  graceEndsAt: integer('grace_ends_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_subscriptions_account_status').on(table.billingAccountId, table.status)]);

export const creditLedger = sqliteTable('credit_ledger', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  kind: text('kind', { enum: ['grant', 'usage', 'topup', 'refund', 'adjustment'] }).notNull(),
  credits: real('credits').notNull(),
  referenceType: text('reference_type').notNull(),
  referenceId: text('reference_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_credit_ledger_idempotency').on(table.idempotencyKey), index('idx_credit_ledger_org_created').on(table.organizationId, table.createdAt)]);

export const voiceSessions = sqliteTable('voice_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  language: text('language', { enum: ['it', 'en'] }).notNull(),
  status: text('status', { enum: ['starting', 'active', 'completed', 'failed'] }).notNull(),
  transcriptJson: text('transcript_json').notNull().default('[]'),
  audioRetentionOptIn: integer('audio_retention_opt_in', { mode: 'boolean' }).notNull().default(false),
  latencyMs: integer('latency_ms'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_voice_sessions_project_created').on(table.projectId, table.createdAt)]);

export const agentProfiles = sqliteTable('agent_profiles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  name: text('name').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_agent_profiles_org_status').on(table.organizationId, table.status)]);

export const agentVersions = sqliteTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agentProfiles.id),
  version: integer('version').notNull(),
  instructions: text('instructions').notNull(),
  toolsJson: text('tools_json').notNull().default('[]'),
  knowledgeJson: text('knowledge_json').notNull().default('[]'),
  memoryPolicyJson: text('memory_policy_json').notNull().default('{}'),
  guardrailsJson: text('guardrails_json').notNull().default('{}'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_agent_versions_agent_version').on(table.agentId, table.version)]);

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  agentVersionId: text('agent_version_id').notNull().references(() => agentVersions.id),
  projectId: text('project_id').references(() => projects.id),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed', 'blocked'] }).notNull(),
  traceId: text('trace_id').notNull(),
  cost: real('cost').notNull().default(0),
  evaluationJson: text('evaluation_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_agent_runs_version_created').on(table.agentVersionId, table.createdAt)]);

export const mcpConnections = sqliteTable('mcp_connections', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').references(() => projects.id),
  direction: text('direction', { enum: ['client', 'server_client'] }).notNull(),
  serverUrl: text('server_url').notNull(),
  oauthClientRef: text('oauth_client_ref'),
  permissionsJson: text('permissions_json').notNull().default('[]'),
  status: text('status', { enum: ['pending', 'active', 'revoked'] }).notNull(),
  rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(30),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_mcp_connections_org_status').on(table.organizationId, table.status)]);

export const projectMembers = sqliteTable('project_members', {
  projectId: text('project_id').notNull().references(() => projects.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'builder', 'reviewer', 'viewer'] }).notNull(),
  invitedBy: text('invited_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_project_members_pair').on(table.projectId, table.userId), index('idx_project_members_user').on(table.userId)]);

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  authorUserId: text('author_user_id').notNull().references(() => users.id),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  parentId: text('parent_id'),
  body: text('body').notNull(),
  status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_comments_resource_created').on(table.projectId, table.resourceType, table.resourceId, table.createdAt)]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  type: text('type').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_notifications_user_created').on(table.userId, table.createdAt)]);

export const visualSelections = sqliteTable('visual_selections', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  previewId: text('preview_id').references(() => previewSessions.id),
  selector: text('selector').notNull(),
  sourcePath: text('source_path'),
  sourceLine: integer('source_line'),
  cropArtifactId: text('crop_artifact_id').references(() => artifacts.id),
  constraintsJson: text('constraints_json').notNull().default('{}'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_visual_selections_project_created').on(table.projectId, table.createdAt)]);

export const designTokens = sqliteTable('design_tokens', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  sourceArtifactId: text('source_artifact_id').references(() => artifacts.id),
  version: integer('version').notNull(),
  tokensJson: text('tokens_json').notNull(),
  status: text('status', { enum: ['extracted', 'reviewed', 'applied'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_design_tokens_project_version').on(table.projectId, table.version)]);

export const providerHealth = sqliteTable('provider_health', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  region: text('region').notNull(),
  status: text('status', { enum: ['healthy', 'degraded', 'down', 'unknown'] }).notNull(),
  latencyMs: integer('latency_ms'),
  detailsJson: text('details_json').notNull().default('{}'),
  checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('idx_provider_health_provider_checked').on(table.provider, table.checkedAt)]);

export const backupRuns = sqliteTable('backup_runs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  scope: text('scope').notNull(),
  artifactId: text('artifact_id').references(() => artifacts.id),
  status: text('status', { enum: ['running', 'completed', 'failed', 'restored'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  restoreTestedAt: integer('restore_tested_at', { mode: 'timestamp_ms' }),
}, (table) => [index('idx_backup_runs_scope_started').on(table.scope, table.startedAt)]);

export const certificationRuns = sqliteTable('certification_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  scenario: text('scenario').notNull(),
  runNumber: integer('run_number').notNull(),
  status: text('status', { enum: ['passed', 'failed', 'blocked', 'not_run'] }).notNull(),
  evidenceJson: text('evidence_json').notNull().default('[]'),
  blocker: text('blocker'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [uniqueIndex('idx_certification_project_scenario_run').on(table.projectId, table.scenario, table.runNumber)]);
