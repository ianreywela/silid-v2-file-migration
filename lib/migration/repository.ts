import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  migrationBatches,
  migrationSchoolJobs,
  migrationFilePaths,
  migrationLogs,
} from "@/drizzle/schema";

export async function getBatchStatus(batchId: string) {
  const [batch] = await db
    .select({ status: migrationBatches.status })
    .from(migrationBatches)
    .where(eq(migrationBatches.id, batchId))
    .limit(1);
  return batch?.status ?? null;
}

export async function appendLog(schoolJobId: string, tag: string, message: string) {
  await db.insert(migrationLogs).values({ schoolJobId, tag, message });
}

export async function updateSchoolJob(
  schoolJobId: string,
  data: Partial<typeof migrationSchoolJobs.$inferInsert>,
) {
  await db
    .update(migrationSchoolJobs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(migrationSchoolJobs.id, schoolJobId));
}

export type TransferredPathRecord = {
  filePath: string;
  fileSizeBytes: number | null;
  transferredAt: Date | null;
};

export async function lookupTransferredPaths(
  schoolCode: string,
  filePaths: string[],
): Promise<Map<string, TransferredPathRecord>> {
  const index = new Map<string, TransferredPathRecord>();
  if (filePaths.length === 0) return index;

  const LOOKUP_BATCH_SIZE = 500;
  for (let offset = 0; offset < filePaths.length; offset += LOOKUP_BATCH_SIZE) {
    const chunk = filePaths.slice(offset, offset + LOOKUP_BATCH_SIZE);
    const rows = await db
      .select({
        filePath: migrationFilePaths.filePath,
        fileSizeBytes: migrationFilePaths.fileSizeBytes,
        transferredAt: migrationFilePaths.transferredAt,
      })
      .from(migrationFilePaths)
      .innerJoin(
        migrationSchoolJobs,
        eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
      )
      .where(
        and(
          eq(migrationSchoolJobs.schoolCode, schoolCode),
          eq(migrationFilePaths.status, "transferred"),
          inArray(migrationFilePaths.filePath, chunk),
        ),
      );

    for (const row of rows) {
      if (!index.has(row.filePath)) {
        index.set(row.filePath, {
          filePath: row.filePath,
          fileSizeBytes: row.fileSizeBytes == null ? null : Number(row.fileSizeBytes),
          transferredAt: row.transferredAt,
        });
      }
    }
  }

  return index;
}

/** @deprecated Use lookupTransferredPaths in batches instead. */
export async function getTransferredPathIndexForSchool(
  schoolCode: string,
): Promise<Map<string, TransferredPathRecord>> {
  const rows = await db
    .select({
      filePath: migrationFilePaths.filePath,
      fileSizeBytes: migrationFilePaths.fileSizeBytes,
      transferredAt: migrationFilePaths.transferredAt,
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(
      and(
        eq(migrationSchoolJobs.schoolCode, schoolCode),
        eq(migrationFilePaths.status, "transferred"),
      ),
    );

  const index = new Map<string, TransferredPathRecord>();
  for (const row of rows) {
    if (!index.has(row.filePath)) {
      index.set(row.filePath, {
        filePath: row.filePath,
        fileSizeBytes: row.fileSizeBytes == null ? null : Number(row.fileSizeBytes),
        transferredAt: row.transferredAt,
      });
    }
  }

  return index;
}

/** Keep under Postgres btree index row limit (~2704 bytes including uuid). */
const MAX_FILE_PATH_CHARS = 2000;
const UPSERT_BATCH_SIZE = 100;

function normalizeFilePath(filePath: string): string | null {
  const cleaned = filePath.replace(/\0/g, "").trim().replace(/^\/+/, "");
  if (!cleaned) return null;
  if (cleaned.length > MAX_FILE_PATH_CHARS) return null;
  return cleaned;
}

async function insertFilePathBatch(
  schoolJobId: string,
  schoolCode: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;

  const priorTransfers = await lookupTransferredPaths(schoolCode, paths);
  const toInsert = paths.map((filePath) => {
    const prior = priorTransfers.get(filePath);
    if (prior) {
      return {
        schoolJobId,
        filePath,
        status: "transferred" as const,
        fileSizeBytes: prior.fileSizeBytes ?? null,
        errorMessage: null,
        transferredAt: prior.transferredAt ?? new Date(),
      };
    }

    return {
      schoolJobId,
      filePath,
      status: "pending" as const,
      fileSizeBytes: null,
      errorMessage: null,
      transferredAt: null,
    };
  });

  try {
    await db
      .insert(migrationFilePaths)
      .values(toInsert)
      .onConflictDoNothing({
        target: [migrationFilePaths.schoolJobId, migrationFilePaths.filePath],
      });
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(
      `insert migration_file_paths failed (batch=${toInsert.length}): ${cause}`,
    );
  }
}

export async function upsertFilePathsFromSet(
  schoolJobId: string,
  schoolCode: string,
  paths: Set<string>,
): Promise<{ inserted: number; skippedInvalid: number }> {
  if (paths.size === 0) return { inserted: 0, skippedInvalid: 0 };

  let batch: string[] = [];
  let inserted = 0;
  let skippedInvalid = 0;

  for (const rawPath of paths) {
    const filePath = normalizeFilePath(rawPath);
    if (!filePath) {
      skippedInvalid += 1;
      continue;
    }

    batch.push(filePath);
    if (batch.length >= UPSERT_BATCH_SIZE) {
      await insertFilePathBatch(schoolJobId, schoolCode, batch);
      inserted += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertFilePathBatch(schoolJobId, schoolCode, batch);
    inserted += batch.length;
  }

  return { inserted, skippedInvalid };
}

export async function upsertFilePaths(
  schoolJobId: string,
  schoolCode: string,
  folderPaths: string[],
  _transferredIndex?: Map<string, TransferredPathRecord>,
) {
  if (folderPaths.length === 0) return;
  await upsertFilePathsFromSet(schoolJobId, schoolCode, new Set(folderPaths));
}

export async function refreshSchoolJobCounts(schoolJobId: string) {
  const [counts] = await db
    .select({
      collected: sql<number>`count(*)::int`,
      transferred: sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'transferred')::int`,
      skipped: sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'skipped')::int`,
      failed: sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'pending')::int`,
      transferredBytes: sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'transferred'), 0)::bigint`,
    })
    .from(migrationFilePaths)
    .where(eq(migrationFilePaths.schoolJobId, schoolJobId));

  if (!counts) return;

  await updateSchoolJob(schoolJobId, {
    collected: counts.collected,
    transferred: counts.transferred,
    skipped: counts.skipped,
    failed: counts.failed,
    pending: counts.pending,
    transferredBytes: counts.transferredBytes,
  });
}

export async function countPendingFilePaths(schoolJobId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationFilePaths)
    .where(
      and(
        eq(migrationFilePaths.schoolJobId, schoolJobId),
        eq(migrationFilePaths.status, "pending"),
      ),
    );

  return row?.count ?? 0;
}

export async function getPendingFilePathsPage(schoolJobId: string, limit = 100) {
  return db
    .select({
      id: migrationFilePaths.id,
      filePath: migrationFilePaths.filePath,
    })
    .from(migrationFilePaths)
    .where(
      and(
        eq(migrationFilePaths.schoolJobId, schoolJobId),
        eq(migrationFilePaths.status, "pending"),
      ),
    )
    .orderBy(migrationFilePaths.createdAt)
    .limit(limit);
}

export async function getPendingFilePaths(schoolJobId: string) {
  return db
    .select()
    .from(migrationFilePaths)
    .where(
      and(
        eq(migrationFilePaths.schoolJobId, schoolJobId),
        eq(migrationFilePaths.status, "pending"),
      ),
    )
    .orderBy(migrationFilePaths.createdAt);
}

export async function markFilePath(
  filePathId: string,
  status: "transferred" | "skipped" | "failed",
  errorMessage?: string,
  fileSizeBytes?: number,
) {
  await db
    .update(migrationFilePaths)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      fileSizeBytes: status === "transferred" ? (fileSizeBytes ?? null) : null,
      transferredAt: status === "transferred" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(migrationFilePaths.id, filePathId));
}

export async function getRunnableBatches() {
  return db
    .select()
    .from(migrationBatches)
    .where(sql`${migrationBatches.status} in ('queued', 'running')`)
    .orderBy(migrationBatches.createdAt);
}

export async function countFilePathsForSchoolJob(schoolJobId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationFilePaths)
    .where(eq(migrationFilePaths.schoolJobId, schoolJobId));

  return row?.count ?? 0;
}

export async function reconcilePausedSchoolJobs(batchId: string) {
  const batchStatus = await getBatchStatus(batchId);
  if (batchStatus !== "running" && batchStatus !== "queued") {
    return;
  }

  await db
    .update(migrationSchoolJobs)
    .set({ status: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(migrationSchoolJobs.batchId, batchId),
        eq(migrationSchoolJobs.status, "paused"),
      ),
    );
}

export async function rerunFailedSchoolJobs(batchId: string) {
  const failedJobs = await db
    .select({ id: migrationSchoolJobs.id })
    .from(migrationSchoolJobs)
    .where(
      and(
        eq(migrationSchoolJobs.batchId, batchId),
        eq(migrationSchoolJobs.status, "failed"),
      ),
    );

  if (failedJobs.length === 0) {
    return 0;
  }

  const failedJobIds = failedJobs.map((job) => job.id);

  await db
    .update(migrationFilePaths)
    .set({
      status: "pending",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(migrationFilePaths.schoolJobId, failedJobIds),
        eq(migrationFilePaths.status, "failed"),
      ),
    );

  await db
    .update(migrationSchoolJobs)
    .set({ status: "pending", updatedAt: new Date() })
    .where(inArray(migrationSchoolJobs.id, failedJobIds));

  return failedJobs.length;
}

export async function getPendingSchoolJobs(batchId: string) {
  return db
    .select()
    .from(migrationSchoolJobs)
    .where(
      and(
        eq(migrationSchoolJobs.batchId, batchId),
        sql`${migrationSchoolJobs.status} in ('pending', 'collecting', 'transferring')`,
      ),
    )
    .orderBy(migrationSchoolJobs.createdAt);
}

export async function isBatchComplete(batchId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationSchoolJobs)
    .where(
      and(
        eq(migrationSchoolJobs.batchId, batchId),
        sql`${migrationSchoolJobs.status} not in ('completed', 'failed')`,
      ),
    );
  return (result?.count ?? 0) === 0;
}

export async function setBatchStatus(
  batchId: string,
  status: typeof migrationBatches.$inferSelect.status,
) {
  await db
    .update(migrationBatches)
    .set({ status, updatedAt: new Date() })
    .where(eq(migrationBatches.id, batchId));
}

export async function getActiveBatch() {
  const [batch] = await db
    .select()
    .from(migrationBatches)
    .where(sql`${migrationBatches.status} in ('queued', 'running', 'paused')`)
    .orderBy(desc(migrationBatches.createdAt))
    .limit(1);

  return batch ?? null;
}
