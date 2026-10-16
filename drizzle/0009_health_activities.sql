CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`distance_km` real,
	`kcal` real,
	`hidden_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_external_id_unique` ON `activities` (`external_id`);--> statement-breakpoint
CREATE INDEX `activities_started_idx` ON `activities` (`started_at`);