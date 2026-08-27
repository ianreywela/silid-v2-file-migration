import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationFilePaths, migrationSchoolJobs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";

type RouteContext = { params: Promise<{ id: string }> };

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
      totalBytes: sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}), 0)::bigint`,
      transferredBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'transferred'), 0)::bigint`,
    })
    .from(migrationSchoolJobs)
    .leftJoin(
      migrationFilePaths,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(eq(migrationSchoolJobs.batchId, id))
    .groupBy(migrationSchoolJobs.id)
    .orderBy(migrationSchoolJobs.schoolCode);

  const [overall] = await db
    .select({
      totalTransferredFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.transferred}), 0)::int`,
      totalSkippedFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.skipped}), 0)::int`,
      totalFailedFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.failed}), 0)::int`,
      totalPendingFiles: sql<number>`coalesce(sum(${migrationSchoolJobs.pending}), 0)::int`,
      schoolCount: sql<number>`count(*)::int`,
    })
    .from(migrationSchoolJobs)
    .where(eq(migrationSchoolJobs.batchId, id));

  const [byteStats] = await db
    .select({
      totalSizeBytes: sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}), 0)::bigint`,
      totalTransferredBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'transferred'), 0)::bigint`,
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(eq(migrationSchoolJobs.batchId, id));

  return Response.json({
    success: true,
    data: {
      overall: {
        totalTransferredFiles: overall?.totalTransferredFiles ?? 0,
        totalSkippedFiles: overall?.totalSkippedFiles ?? 0,
        totalFailedFiles: overall?.totalFailedFiles ?? 0,
        totalPendingFiles: overall?.totalPendingFiles ?? 0,
        totalSizeBytes: toNumber(byteStats?.totalSizeBytes),
        totalTransferredBytes: toNumber(byteStats?.totalTransferredBytes),
        schoolCount: overall?.schoolCount ?? 0,
      },
      schools: schoolStats.map((school) => ({
        schoolJobId: school.schoolJobId,
        schoolCode: school.schoolCode,
        schoolName: school.schoolName,
        status: school.status,
        transferred: school.transferred,
        skipped: school.skipped,
        failed: school.failed,
        pending: school.pending,
        totalBytes: toNumber(school.totalBytes),
        transferredBytes: toNumber(school.transferredBytes),
      })),
    },
  });
}
