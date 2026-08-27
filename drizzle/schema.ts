import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const batchStatusEnum = pgEnum("batch_status", [
  "draft",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const schoolJobStatusEnum = pgEnum("school_job_status", [
  "pending",
  "collecting",
  "transferring",
  "completed",
  "failed",
  "paused",
]);

export const filePathStatusEnum = pgEnum("file_path_status", [
  "pending",
  "transferred",
  "skipped",
  "failed",
]);

export const migrationBatches = pgTable("migration_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  status: batchStatusEnum("status").default("draft").notNull(),
  concurrency: integer("concurrency").default(5).notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const migrationSchoolJobs = pgTable(
  "migration_school_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => migrationBatches.id, { onDelete: "cascade" }),
    schoolCode: text("school_code").notNull(),
    schoolName: text("school_name").notNull(),
    schoolYear: text("school_year"),
    status: schoolJobStatusEnum("status").default("pending").notNull(),
    collected: integer("collected").default(0).notNull(),
    transferred: integer("transferred").default(0).notNull(),
    skipped: integer("skipped").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    pending: integer("pending").default(0).notNull(),
    transferredBytes: bigint("transferred_bytes", { mode: "number" }).default(0).notNull(),
    userCount: integer("user_count").default(0).notNull(),
    classCount: integer("class_count").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("migration_school_jobs_batch_id_idx").on(table.batchId),
    uniqueIndex("migration_school_jobs_batch_school_idx").on(
      table.batchId,
      table.schoolCode,
    ),
  ],
);

export const migrationFilePaths = pgTable(
  "migration_file_paths",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolJobId: uuid("school_job_id")
      .notNull()
      .references(() => migrationSchoolJobs.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    status: filePathStatusEnum("status").default("pending").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    errorMessage: text("error_message"),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("migration_file_paths_school_job_path_idx").on(
      table.schoolJobId,
      table.filePath,
    ),
    index("migration_file_paths_school_job_status_idx").on(
      table.schoolJobId,
      table.status,
    ),
  ],
);

export const migrationLogs = pgTable(
  "migration_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolJobId: uuid("school_job_id")
      .notNull()
      .references(() => migrationSchoolJobs.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("migration_logs_school_job_id_idx").on(table.schoolJobId),
    index("migration_logs_created_at_idx").on(table.createdAt),
  ],
);

export type MigrationBatch = typeof migrationBatches.$inferSelect;
export type MigrationSchoolJob = typeof migrationSchoolJobs.$inferSelect;
export type MigrationFilePath = typeof migrationFilePaths.$inferSelect;
export type MigrationLog = typeof migrationLogs.$inferSelect;
