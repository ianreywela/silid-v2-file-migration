CREATE TYPE "public"."batch_status" AS ENUM('draft', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."file_path_status" AS ENUM('pending', 'transferred', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."school_job_status" AS ENUM('pending', 'collecting', 'transferring', 'completed', 'failed', 'paused');--> statement-breakpoint
CREATE TABLE "migration_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" "batch_status" DEFAULT 'draft' NOT NULL,
	"concurrency" integer DEFAULT 5 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_file_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_job_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"status" "file_path_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_job_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_school_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"school_code" text NOT NULL,
	"school_name" text NOT NULL,
	"school_year" text,
	"status" "school_job_status" DEFAULT 'pending' NOT NULL,
	"collected" integer DEFAULT 0 NOT NULL,
	"transferred" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"user_count" integer DEFAULT 0 NOT NULL,
	"class_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "migration_file_paths" ADD CONSTRAINT "migration_file_paths_school_job_id_migration_school_jobs_id_fk" FOREIGN KEY ("school_job_id") REFERENCES "public"."migration_school_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_logs" ADD CONSTRAINT "migration_logs_school_job_id_migration_school_jobs_id_fk" FOREIGN KEY ("school_job_id") REFERENCES "public"."migration_school_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_school_jobs" ADD CONSTRAINT "migration_school_jobs_batch_id_migration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."migration_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "migration_file_paths_school_job_path_idx" ON "migration_file_paths" USING btree ("school_job_id","file_path");--> statement-breakpoint
CREATE INDEX "migration_file_paths_school_job_status_idx" ON "migration_file_paths" USING btree ("school_job_id","status");--> statement-breakpoint
CREATE INDEX "migration_logs_school_job_id_idx" ON "migration_logs" USING btree ("school_job_id");--> statement-breakpoint
CREATE INDEX "migration_logs_created_at_idx" ON "migration_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "migration_school_jobs_batch_id_idx" ON "migration_school_jobs" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "migration_school_jobs_batch_school_idx" ON "migration_school_jobs" USING btree ("batch_id","school_code");