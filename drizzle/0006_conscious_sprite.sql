CREATE TABLE `__new_certification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scenario` text NOT NULL,
	`run_number` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`blocker` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_certification_runs` (`id`,`project_id`,`scenario`,`run_number`,`status`,`evidence_json`,`blocker`,`created_at`)
SELECT c.`id`, p.`id`, c.`scenario`, c.`run_number`, c.`status`, c.`evidence_json`, c.`blocker`, c.`created_at`
FROM `certification_runs` c
JOIN `projects` p
  ON p.`id` = json_extract(c.`evidence_json`, '$.projectId')
  OR c.`blocker` LIKE ('project:' || p.`id` || ':%');
--> statement-breakpoint
DROP TABLE `certification_runs`;
--> statement-breakpoint
ALTER TABLE `__new_certification_runs` RENAME TO `certification_runs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_certification_project_scenario_run` ON `certification_runs` (`project_id`,`scenario`,`run_number`);
