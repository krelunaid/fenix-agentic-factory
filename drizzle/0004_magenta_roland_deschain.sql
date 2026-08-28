CREATE TABLE `approval_votes` (
	`approval_id` text NOT NULL,
	`user_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_approval_votes_pair` ON `approval_votes` (`approval_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_approval_votes_approval` ON `approval_votes` (`approval_id`);--> statement-breakpoint
ALTER TABLE `approvals` ADD `required_approvals` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `approvals` ADD `required_rejections` integer DEFAULT 1 NOT NULL;
