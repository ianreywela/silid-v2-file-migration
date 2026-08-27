import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationSchoolJobs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;

  const schoolStats = await db
    .select({
      schoolJobId: migrationSchoolJobs.id,
      schoolCode: migrationSchoolJobs.schoolCode,
      schoolName: migrationSchoolJobs.schoolName,
      status: migrationSchoolJobs.status,
      transferred: migrationSchoolJobs.transferred,
      skipped: migrationSchoolJobs.skipped,
      failed: migrationSchoolJobs.failed,
      pending: migrationSchoolJobs.pending,
      transferredBytes: migrationSchoolJobs.transferredBytes,
    })
    .from(migrationSchoolJobs)
    .where(eq(migrationSchoolJobs.batchId, id))
    .orderBy(migrationSchoolJobs.schoolCode);

  const [overall] = await db
    .select({
      totalTransferredFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.transferred}), 0)::int`,
      totalSkippedFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.skipped}), 0)::int`,
      totalFailedFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.failed}), 0)::int`,
      totalPendingFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.pending}), 0)::int`,
      totalTransferredBytes: sql<number>`coalesce(sum(${migrationSchoolJobs.transferredBytes}), 0)::bigint`,
      schoolCount: sql<number>`count(*)::int`,
    })
    .from(migrationSchoolJobs)
    .where(eq(migrationSchoolJobs.batchId, id));

  return Response.json({
    success: true,
    data: {
      overall: overall ?? {
        totalTransferredFiles: 0,
        totalSkippedFiles: 0,
        totalFailedFiles: 0,
        totalPendingFiles: 0,
        totalTransferredBytes: 0,
        schoolCount: 0,
      },
      schools: schoolStats,
    },
  });
}
