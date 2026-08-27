import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationBatches, migrationFilePaths, migrationSchoolJobs } from "@/drizzle/schema";

type Ledger = Record<string, boolean>;

async function main() {
  const ledgerDir =
    process.argv[2] ??
    path.resolve(
      process.cwd(),
      "../python-projects/silid-python-functions/exports/obs_file_migration_data",
    );

  const batchId = process.argv[3];
  if (!batchId) {
    console.error("Usage: npm run import:ledgers -- <ledger-dir> <batch-id>");
    process.exit(1);
  }

  const [batch] = await db
    .select()
    .from(migrationBatches)
    .where(eq(migrationBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const files = (await readdir(ledgerDir)).filter((file) => file.endsWith(".json"));
  console.log(`Importing ${files.length} ledger files from ${ledgerDir}`);

  for (const file of files) {
    const schoolCode = path.basename(file, ".json");
    const content = await readFile(path.join(ledgerDir, file), "utf8");
    const ledger = JSON.parse(content) as Ledger;

    let [schoolJob] = await db
      .select()
      .from(migrationSchoolJobs)
      .where(eq(migrationSchoolJobs.schoolCode, schoolCode))
      .limit(1);

    if (!schoolJob) {
      [schoolJob] = await db
        .insert(migrationSchoolJobs)
        .values({
          batchId,
          schoolCode,
          schoolName: schoolCode,
          status: "pending",
        })
        .returning();
    }

    const rows = Object.entries(ledger).map(([filePath, done]) => ({
      schoolJobId: schoolJob.id,
      filePath,
      status: done ? ("transferred" as const) : ("pending" as const),
      transferredAt: done ? new Date() : null,
    }));

    for (const row of rows) {
      await db.insert(migrationFilePaths).values(row).onConflictDoNothing();
    }

    const transferred = rows.filter((row) => row.status === "transferred").length;
    const pending = rows.filter((row) => row.status === "pending").length;

    await db
      .update(migrationSchoolJobs)
      .set({
        collected: rows.length,
        transferred,
        pending,
        updatedAt: new Date(),
      })
      .where(eq(migrationSchoolJobs.id, schoolJob.id));

    console.log(`Imported ${schoolCode}: ${rows.length} paths (${transferred} transferred)`);
  }

  console.log("Import complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
