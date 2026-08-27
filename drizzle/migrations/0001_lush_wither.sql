ALTER TABLE "migration_file_paths" ADD COLUMN "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "migration_school_jobs" ADD COLUMN "transferred_bytes" bigint DEFAULT 0 NOT NULL;