import { collectFolderPathsBySchool } from "@/lib/migration/collect-paths";
import { transferFile } from "@/lib/migration/transfer-file";
import {
  appendLog,
  countFilePathsForSchoolJob,
  countPendingFilePaths,
  getBatchStatus,
  getPendingFilePathsPage,
  lookupTransferredPaths,
  markFilePath,
  refreshSchoolJobCounts,
  updateSchoolJob,
  upsertFilePathsFromSet,
} from "@/lib/migration/repository";
import type { MigrationSchoolJob } from "@/drizzle/schema";

const BATCH_STATUS_RETRIES = 5;
const BATCH_STATUS_RETRY_MS = 500;
const PENDING_PAGE_SIZE = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isBatchRunnable(batchId: string, schoolJobId: string): Promise<boolean> {
  for (let attempt = 0; attempt < BATCH_STATUS_RETRIES; attempt++) {
    const batchStatus = await getBatchStatus(batchId);

    if (batchStatus === "running" || batchStatus === "queued") {
      return true;
    }

    if (batchStatus === "paused" || batchStatus === "cancelled") {
      await updateSchoolJob(schoolJobId, { status: "paused" });
      return false;
    }

    if (attempt < BATCH_STATUS_RETRIES - 1) {
      await sleep(BATCH_STATUS_RETRY_MS * (attempt + 1));
    }
  }

  await updateSchoolJob(schoolJobId, { status: "paused" });
  await appendLog(
    schoolJobId,
    "PAUSE",
    "batch status unavailable after retries; school job paused",
  );
  return false;
}

export async function processSchoolJob(job: MigrationSchoolJob): Promise<void> {
  const { id: schoolJobId, batchId, schoolCode } = job;

  if (!(await isBatchRunnable(batchId, schoolJobId))) {
    return;
  }

  const collectedFileCount = await countFilePathsForSchoolJob(schoolJobId);
  const shouldCollect = collectedFileCount === 0;

  if (shouldCollect) {
    await updateSchoolJob(schoolJobId, {
      status: "collecting",
      startedAt: job.startedAt ?? new Date(),
    });

    await appendLog(
      schoolJobId,
      "START",
      `schoolCode=${schoolCode} schoolName=${job.schoolName}`,
    );

    const collection = await collectFolderPathsBySchool(schoolCode, (tag, message) => {
      void appendLog(schoolJobId, tag, message);
    });

    await updateSchoolJob(schoolJobId, {
      userCount: collection.userCount,
      classCount: collection.classCount,
    });

    const collected = collection.pathKeys.size;
    const { inserted, skippedInvalid } = await upsertFilePathsFromSet(
      schoolJobId,
      schoolCode,
      collection.pathKeys,
    );
    await refreshSchoolJobCounts(schoolJobId);

    const pending = await countPendingFilePaths(schoolJobId);
    const skippedExisting = Math.max(0, inserted - pending);
    await appendLog(
      schoolJobId,
      "JSON",
      `collected=${collected} inserted=${inserted} pending=${pending} already_transferred=${skippedExisting} invalid_paths=${skippedInvalid}`,
    );
  } else {
    await updateSchoolJob(schoolJobId, {
      status: "transferring",
      startedAt: job.startedAt ?? new Date(),
    });

    await appendLog(
      schoolJobId,
      "RESUME",
      `schoolCode=${schoolCode} resuming transfer (${collectedFileCount} paths in database)`,
    );

    await refreshSchoolJobCounts(schoolJobId);
  }

  const pendingTotal = await countPendingFilePaths(schoolJobId);
  if (pendingTotal === 0) {
    await updateSchoolJob(schoolJobId, {
      status: "completed",
      completedAt: new Date(),
    });
    await appendLog(schoolJobId, "DONE", "no pending files");
    return;
  }

  await updateSchoolJob(schoolJobId, { status: "transferring" });

  let processed = 0;

  while (true) {
    const pendingBatch = await getPendingFilePathsPage(schoolJobId, PENDING_PAGE_SIZE);
    if (pendingBatch.length === 0) {
      break;
    }

    const priorTransfers = await lookupTransferredPaths(
      schoolCode,
      pendingBatch.map((file) => file.filePath),
    );

    for (const file of pendingBatch) {
      processed += 1;

      const batchStatus = await getBatchStatus(batchId);
      if (!batchStatus || batchStatus === "paused" || batchStatus === "cancelled") {
        await updateSchoolJob(schoolJobId, { status: "paused" });
        await appendLog(schoolJobId, "PAUSE", "batch paused or cancelled");
        return;
      }

      const priorTransfer = priorTransfers.get(file.filePath);
      if (priorTransfer) {
        await markFilePath(
          file.id,
          "transferred",
          undefined,
          priorTransfer.fileSizeBytes ?? undefined,
        );
        await appendLog(
          schoolJobId,
          "SKIP",
          `${file.filePath} | already transferred (skipped upload)`,
        );
        continue;
      }

      await appendLog(
        schoolJobId,
        "TRANSFER",
        `[${processed}/${pendingTotal}] ${file.filePath}`,
      );

      try {
        const result = await transferFile(file.filePath);

        if (result.ok) {
          const size = Number(result.body.size ?? 0);
          await markFilePath(file.id, "transferred", undefined, size);
          await appendLog(
            schoolJobId,
            "OK",
            size > 0 ? `${file.filePath} (${size} bytes)` : file.filePath,
          );
        } else if (result.statusCode === 404) {
          await markFilePath(file.id, "skipped", String(result.body.message ?? "Not found"));
          await appendLog(
            schoolJobId,
            "SKIP",
            `${file.filePath} | ${result.statusCode} ${String(result.body.message ?? "")}`,
          );
        } else {
          const message = String(result.body.message ?? JSON.stringify(result.body));
          await markFilePath(file.id, "failed", message);
          await appendLog(
            schoolJobId,
            "ERROR",
            `${file.filePath} | ${result.statusCode} ${message}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markFilePath(file.id, "failed", message);
        await appendLog(schoolJobId, "ERROR", `${file.filePath} | ${message}`);
      }
    }

    await refreshSchoolJobCounts(schoolJobId);
  }

  const finalBatchStatus = await getBatchStatus(batchId);
  if (finalBatchStatus === "paused" || finalBatchStatus === "cancelled") {
    await updateSchoolJob(schoolJobId, { status: "paused" });
    return;
  }

  await updateSchoolJob(schoolJobId, {
    status: "completed",
    completedAt: new Date(),
  });

  await appendLog(schoolJobId, "DONE", `school ${schoolCode} completed`);
}
