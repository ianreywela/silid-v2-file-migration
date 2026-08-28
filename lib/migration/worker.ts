import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { migrationSchoolJobs } from "@/drizzle/schema";
import { processSchoolJob } from "@/lib/migration/process-school";
import {
  appendLog,
  getPendingSchoolJobs,
  getRunnableBatches,
  isBatchComplete,
  reconcilePausedSchoolJobs,
  setBatchStatus,
} from "@/lib/migration/repository";

const POLL_INTERVAL_MS = 5000;

const globalForWorker = globalThis as typeof globalThis & {
  __migrationWorkerStarted?: boolean;
};

async function processBatch(batchId: string, concurrency: number) {
  const limit = pLimit(concurrency);

  while (true) {
    const batches = await getRunnableBatches();
    const batch = batches.find((b) => b.id === batchId);

    if (!batch || batch.status === "paused" || batch.status === "cancelled") {
      return;
    }

    if (batch.status === "queued") {
      await setBatchStatus(batchId, "running");
    }

    await reconcilePausedSchoolJobs(batchId);

    const schoolJobs = await getPendingSchoolJobs(batchId);
    if (schoolJobs.length === 0) {
      break;
    }

    await Promise.all(
      schoolJobs.map((job) =>
        limit(async () => {
          try {
            await processSchoolJob(job);
          } catch (error) {
            const cause =
              error instanceof Error && error.cause instanceof Error
                ? error.cause.message
                : undefined;
            const message = error instanceof Error ? error.message : String(error);
            console.error(
              `School job ${job.id} failed:`,
              cause ? `${message} | cause: ${cause}` : message,
            );
            await db
              .update(migrationSchoolJobs)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(migrationSchoolJobs.id, job.id));
            await appendLog(
              job.id,
              "ERROR",
              `School job failed: ${cause ? `${message} | cause: ${cause}` : message}`.slice(
                0,
                2000,
              ),
            );
          }
        }),
      ),
    );
  }

  const complete = await isBatchComplete(batchId);
  if (complete) {
    await setBatchStatus(batchId, "completed");
    console.log(`Batch ${batchId} completed`);
  }
}

async function runWorkerLoop() {
  console.log("[migration-worker] started");

  while (true) {
    try {
      const batches = await getRunnableBatches();

      if (batches.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      for (const batch of batches) {
        console.log(`[migration-worker] processing batch ${batch.id} (${batch.status})`);
        await processBatch(batch.id, batch.concurrency);
      }
    } catch (error) {
      console.error("[migration-worker] loop error:", error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startMigrationWorker() {
  if (process.env.DISABLE_EMBEDDED_WORKER === "true") {
    return;
  }

  if (globalForWorker.__migrationWorkerStarted) {
    return;
  }

  globalForWorker.__migrationWorkerStarted = true;
  void runWorkerLoop().catch((error) => {
    console.error("[migration-worker] crashed:", error);
    globalForWorker.__migrationWorkerStarted = false;
  });
}
