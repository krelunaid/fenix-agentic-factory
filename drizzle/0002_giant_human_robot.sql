CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`media_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artifacts_storage_key` ON `artifacts` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_job_kind` ON `artifacts` (`job_id`,`kind`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_project_updated` ON `conversations` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `defects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`quality_run_id` text,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quality_run_id`) REFERENCES `quality_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_defects_job_status` ON `defects` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`quality_run_id` text NOT NULL,
	`artifact_id` text,
	`claim` text NOT NULL,
	`status` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quality_run_id`) REFERENCES `quality_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_quality_run` ON `evidence` (`quality_run_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`sandbox_id` text NOT NULL,
	`url` text,
	`port` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sandbox_id`) REFERENCES `sandbox_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_previews_job_status` ON `preview_sessions` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `quality_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`duration_ms` integer,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quality_runs_job_kind` ON `quality_runs` (`job_id`,`kind`);--> statement-breakpoint
CREATE TABLE `recovery_points` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`parent_id` text,
	`source_revision` text NOT NULL,
	`artifact_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recovery_job_created` ON `recovery_points` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_ref` text,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`head_revision` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repositories_project` ON `repositories` (`project_id`);--> statement-breakpoint
CREATE TABLE `repository_files` (
	`repository_id` text NOT NULL,
	`path` text NOT NULL,
	`sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`language` text NOT NULL,
	`generated` integer DEFAULT false NOT NULL,
	`indexed_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repository_files_path` ON `repository_files` (`repository_id`,`path`);--> statement-breakpoint
CREATE INDEX `idx_repository_files_language` ON `repository_files` (`repository_id`,`language`);--> statement-breakpoint
CREATE TABLE `sandbox_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_ref` text,
	`status` text NOT NULL,
	`constraints_json` text DEFAULT '{}' NOT NULL,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sandboxes_job_status` ON `sandbox_sessions` (`job_id`,`status`);