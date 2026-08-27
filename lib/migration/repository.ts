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

export async function upsertFilePaths(
  schoolJobId: string,
  schoolCode: string,
  folderPaths: string[],
  transferredIndex?: Map<string, TransferredPathRecord>,
) {
  if (folderPaths.length === 0) return;

  const existing = await db
    .select({ filePath: migrationFilePaths.filePath, status: migrationFilePaths.status })
    .from(migrationFilePaths)
    .where(eq(migrationFilePaths.schoolJobId, schoolJobId));

  const existingMap = new Map(existing.map((row) => [row.filePath, row.status]));
  const newPaths = folderPaths.filter((path) => !existingMap.has(path));
  if (newPaths.length === 0) return;

  const priorTransfers = transferredIndex ?? (await getTransferredPathIndexForSchool(schoolCode));

  const toInsert = newPaths.map((filePath) => {
    const prior = priorTransfers.get(filePath);
    if (prior) {
      return {
        schoolJobId,
        filePath,
        status: "transferred" as const,
        fileSizeBytes: prior.fileSizeBytes,
        transferredAt: prior.transferredAt ?? new Date(),
      };
    }

    return { schoolJobId, filePath, status: "pending" as const };
  });

  const INSERT_BATCH_SIZE = 500;
  for (let offset = 0; offset < toInsert.length; offset += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(offset, offset + INSERT_BATCH_SIZE);
    if (batch.length === 0) continue;
    await db.insert(migrationFilePaths).values(batch).onConflictDoNothing();
  }
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
