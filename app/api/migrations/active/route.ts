import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationSchoolJobs } from "@/drizzle/schema";
import { getActiveBatch } from "@/lib/migration/repository";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const batch = await getActiveBatch();
  if (!batch) {
    return Response.json({ success: true, data: null });
  }

  const schoolJobs = await db
    .select()
    .from(migrationSchoolJobs)
    .where(eq(migrationSchoolJobs.batchId, batch.id))
    .orderBy(migrationSchoolJobs.schoolCode);

  return Response.json({ success: true, data: { batch, schoolJobs } });
}
