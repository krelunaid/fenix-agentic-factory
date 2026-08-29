CREATE TABLE `prototype_records` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_prototype_records_project_created` ON `prototype_records` (`project_id`,`created_at`);