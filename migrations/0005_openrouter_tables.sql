-- Migration: 0005_openrouter_tables
-- Adds OpenRouter model catalog and user settings tables

CREATE TABLE `or_models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`context_length` integer,
	`input_price` real,
	`output_price` real,
	`capabilities` text DEFAULT '[]',
	`is_selected` integer DEFAULT false,
	`is_free` integer DEFAULT false,
	`first_seen` integer DEFAULT CURRENT_TIMESTAMP,
	`last_updated` integer DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `or_models_provider_idx` ON `or_models` (`provider`);
CREATE INDEX `or_models_is_selected_idx` ON `or_models` (`is_selected`);
CREATE INDEX `or_models_is_free_idx` ON `or_models` (`is_free`);

CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`or_api_key_encrypted` text,
	`or_api_key_preview` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `user_settings_user_idx` ON `user_settings` (`user_id`);
