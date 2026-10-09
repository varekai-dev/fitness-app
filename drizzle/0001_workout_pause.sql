ALTER TABLE `workouts` ADD `paused_at` integer;--> statement-breakpoint
ALTER TABLE `workouts` ADD `paused_ms` integer DEFAULT 0 NOT NULL;