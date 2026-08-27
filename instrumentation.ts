export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startMigrationWorker } = await import("@/lib/migration/worker");
  startMigrationWorker();
}
