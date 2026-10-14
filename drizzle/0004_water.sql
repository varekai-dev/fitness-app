CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `water_intakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drank_at` integer NOT NULL,
	`amount_ml` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `water_intakes_drank_idx` ON `water_intakes` (`drank_at`);