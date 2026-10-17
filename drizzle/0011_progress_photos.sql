CREATE TABLE `progress_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taken_at` integer NOT NULL,
	`pose` text NOT NULL,
	`file_name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `progress_photos_taken_idx` ON `progress_photos` (`taken_at`);