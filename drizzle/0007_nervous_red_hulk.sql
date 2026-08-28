CREATE TABLE `artifact_blobs` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`base64_data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
