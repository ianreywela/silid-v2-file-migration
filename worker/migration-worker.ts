import "dotenv/config";
import { startMigrationWorker } from "@/lib/migration/worker";

startMigrationWorker();

// Keep the standalone worker process alive.
setInterval(() => {}, 60_000);
