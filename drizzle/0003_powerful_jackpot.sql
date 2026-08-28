CREATE TABLE `agent_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_profiles_org_status` ON `agent_profiles` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_version_id` text NOT NULL,
	`project_id` text,
	`status` text NOT NULL,
	`trace_id` text NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`evaluation_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_version_created` ON `agent_runs` (`agent_version_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` integer NOT NULL,
	`instructions` text NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`knowledge_json` text DEFAULT '[]' NOT NULL,
	`memory_policy_json` text DEFAULT '{}' NOT NULL,
	`guardrails_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_versions_agent_version` ON `agent_versions` (`agent_id`,`version`);--> statement-breakpoint
CREATE TABLE `ai_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text,
	`task_id` text,
	`model_catalog_id` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`actual_cost` real,
	`fallback_from` text,
	`trace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_catalog_id`) REFERENCES `model_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ai_calls_project_created` ON `ai_calls` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_calls_job_status` ON `ai_calls` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`secret_ref` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ai_credentials_org_provider` ON `ai_credentials` (`organization_id`,`provider`);--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`scope` text NOT NULL,
	`artifact_id` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`restore_tested_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_backup_runs_scope_started` ON `backup_runs` (`scope`,`started_at`);--> statement-breakpoint
CREATE TABLE `billing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`customer_ref` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_billing_accounts_org` ON `billing_accounts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `certification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario` text NOT NULL,
	`run_number` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`blocker` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certification_scenario_run` ON `certification_runs` (`scenario`,`run_number`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comments_resource_created` ON `comments` (`project_id`,`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`credits` real NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_credit_ledger_idempotency` ON `credit_ledger` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_credit_ledger_org_created` ON `credit_ledger` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `custom_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`deployment_id` text,
	`hostname` text NOT NULL,
	`status` text NOT NULL,
	`dns_challenge_json` text DEFAULT '{}' NOT NULL,
	`ssl_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deployment_id`) REFERENCES `deployment_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_domains_hostname` ON `custom_domains` (`hostname`);--> statement-breakpoint
CREATE INDEX `idx_custom_domains_project` ON `custom_domains` (`project_id`);--> statement-breakpoint
CREATE TABLE `deployment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`environment` text NOT NULL,
	`provider_ref` text,
	`url` text,
	`status` text NOT NULL,
	`health_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deployments_release_environment` ON `deployment_records` (`release_id`,`environment`);--> statement-breakpoint
CREATE TABLE `design_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_artifact_id` text,
	`version` integer NOT NULL,
	`tokens_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_design_tokens_project_version` ON `design_tokens` (`project_id`,`version`);--> statement-breakpoint
CREATE TABLE `integration_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`idempotency_key` text NOT NULL,
	`action` text NOT NULL,
	`risk_level` text NOT NULL,
	`status` text NOT NULL,
	`request_json` text DEFAULT '{}' NOT NULL,
	`response_json` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_actions_idempotency` ON `integration_actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_integration_actions_project_status` ON `integration_actions` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`direction` text NOT NULL,
	`server_url` text NOT NULL,
	`oauth_client_ref` text,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`rate_limit_per_minute` integer DEFAULT 30 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_connections_org_status` ON `mcp_connections` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `mobile_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`artifact_id` text,
	`platform` text NOT NULL,
	`channel` text NOT NULL,
	`provider_ref` text,
	`status` text NOT NULL,
	`qr_url` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `mobile_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mobile_builds_project_created` ON `mobile_builds` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mobile_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`platform_json` text DEFAULT '["ios","android"]' NOT NULL,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`bundle_identifier` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mobile_profiles_project` ON `mobile_profiles` (`project_id`);--> statement-breakpoint
CREATE TABLE `model_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`input_cost_per_million` real NOT NULL,
	`output_cost_per_million` real NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_catalog_provider_model` ON `model_catalog` (`provider`,`model`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_members_pair` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_project_members_user` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`secret_ref` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`status` text NOT NULL,
	`last_checked_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_provider_connections_org_kind` ON `provider_connections` (`organization_id`,`kind`);--> statement-breakpoint
CREATE TABLE `provider_health` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`region` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer,
	`details_json` text DEFAULT '{}' NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_provider_health_provider_checked` ON `provider_health` (`provider`,`checked_at`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_releases_project_version` ON `releases` (`project_id`,`version`);--> statement-breakpoint
CREATE TABLE `repository_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`direction` text NOT NULL,
	`branch` text NOT NULL,
	`base_revision` text,
	`head_revision` text,
	`status` text NOT NULL,
	`conflict_json` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `source_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_repository_syncs_repo_created` ON `repository_syncs` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`installation_ref` text,
	`secret_ref` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_source_connections_org` ON `source_connections` (`organization_id`,`provider`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`credits_included` real DEFAULT 0 NOT NULL,
	`period_starts_at` integer NOT NULL,
	`period_ends_at` integer NOT NULL,
	`grace_ends_at` integer,
	FOREIGN KEY (`billing_account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_account_status` ON `subscriptions` (`billing_account_id`,`status`);--> statement-breakpoint
CREATE TABLE `visual_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`preview_id` text,
	`selector` text NOT NULL,
	`source_path` text,
	`source_line` integer,
	`crop_artifact_id` text,
	`constraints_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preview_id`) REFERENCES `preview_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_visual_selections_project_created` ON `visual_selections` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`conversation_id` text,
	`language` text NOT NULL,
	`status` text NOT NULL,
	`transcript_json` text DEFAULT '[]' NOT NULL,
	`audio_retention_opt_in` integer DEFAULT false NOT NULL,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_voice_sessions_project_created` ON `voice_sessions` (`project_id`,`created_at`);