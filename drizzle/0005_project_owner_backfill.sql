INSERT OR IGNORE INTO `project_members` (`project_id`,`user_id`,`role`,`invited_by`,`created_at`)
SELECT `id`,`created_by`,'owner',`created_by`,`created_at` FROM `projects`;
