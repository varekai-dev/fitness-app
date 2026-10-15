CREATE TABLE `food_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eaten_at` integer NOT NULL,
	`food_id` integer,
	`name` text NOT NULL,
	`portion` text,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fiber_g` real,
	`sugar_g` real,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `food_entries_eaten_idx` ON `food_entries` (`eaten_at`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`name` text NOT NULL,
	`portion` text,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fiber_g` real,
	`sugar_g` real,
	`last_used_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_query_unique` ON `foods` (`query`);