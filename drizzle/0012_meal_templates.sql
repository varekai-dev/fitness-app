CREATE TABLE `meal_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`items` text NOT NULL,
	`last_used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_templates_name_unique` ON `meal_templates` (`name`);