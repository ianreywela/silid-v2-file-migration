import { collectFolderPathsBySchool } from "@/lib/migration/collect-paths";
import { transferFile } from "@/lib/migration/transfer-file";
import {
  appendLog,
  getBatchStatus,
  getPendingFilePaths,
  markFilePath,
  refreshSchoolJobCounts,
  updateSchoolJob,
  upsertFilePaths,
} from "@/lib/migration/repository";
import type { MigrationSchoolJob } from "@/drizzle/schema";

export async function processSchoolJob(job: MigrationSchoolJob): Promise<void> {
  const { id: schoolJobId, batchId, schoolCode } = job;

  const batchStatus = await getBatchStatus(batchId);
  if (!batchStatus || batchStatus === "paused" || batchStatus === "cancelled") {
    await updateSchoolJob(schoolJobId, { status: "paused" });
    return;
  }

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

  await upsertFilePaths(schoolJobId, collection.folderPaths);
  await refreshSchoolJobCounts(schoolJobId);

  const pendingBefore = await getPendingFilePaths(schoolJobId);
  await appendLog(
    schoolJobId,
    "JSON",
    `collected=${collection.folderPaths.length} pending=${pendingBefore.length}`,
  );

  if (pendingBefore.length === 0) {
    await updateSchoolJob(schoolJobId, {
      status: "completed",
      completedAt: new Date(),
    });
    await appendLog(schoolJobId, "DONE", "no pending files");
    return;
  }

  await updateSchoolJob(schoolJobId, { status: "transferring" });

  const pendingFiles = await getPendingFilePaths(schoolJobId);
  let index = 0;

  for (const file of pendingFiles) {
    index += 1;

    const currentBatchStatus = await getBatchStatus(batchId);
    if (
      !currentBatchStatus ||
      currentBatchStatus === "paused" ||
      currentBatchStatus === "cancelled"
    ) {
      await updateSchoolJob(schoolJobId, { status: "paused" });
      await appendLog(schoolJobId, "PAUSE", "batch paused or cancelled");
      return;
    }

    await appendLog(
      schoolJobId,
      "TRANSFER",
      `[${index}/${pendingFiles.length}] ${file.filePath}`,
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
