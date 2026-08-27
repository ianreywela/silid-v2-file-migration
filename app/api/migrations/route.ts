import { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationBatches, migrationSchoolJobs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";
import { getSchoolName } from "@/lib/firebase/schools";

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const batches = await db
    .select({
      id: migrationBatches.id,
      startDate: migrationBatches.startDate,
      endDate: migrationBatches.endDate,
      status: migrationBatches.status,
      concurrency: migrationBatches.concurrency,
      createdBy: migrationBatches.createdBy,
      createdAt: migrationBatches.createdAt,
      updatedAt: migrationBatches.updatedAt,
      schoolCount: sql<number>`count(${migrationSchoolJobs.id})::int`,
      completedSchools: sql<number>`count(*) filter (where ${migrationSchoolJobs.status} = 'completed')::int`,
      totalTransferred: sql<number>`coalesce(sum(${migrationSchoolJobs.transferred}), 0)::int`,
      totalPending: sql<number>`coalesce(sum(${migrationSchoolJobs.pending}), 0)::int`,
    })
    .from(migrationBatches)
    .leftJoin(migrationSchoolJobs, eq(migrationSchoolJobs.batchId, migrationBatches.id))
    .groupBy(migrationBatches.id)
    .orderBy(desc(migrationBatches.createdAt));

  return Response.json({ success: true, data: batches });
}

export async function POST(request: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const {
    startDate,
    endDate,
    schoolCodes,
    concurrency = 5,
  } = body as {
    startDate: string;
    endDate: string;
    schoolCodes: string[];
    concurrency?: number;
  };

  if (!startDate || !endDate || !Array.isArray(schoolCodes) || schoolCodes.length === 0) {
    return Response.json(
      { success: false, error: "startDate, endDate, and schoolCodes are required" },
      { status: 400 },
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Response.json(
      { success: false, error: "Invalid startDate or endDate" },
      { status: 400 },
    );
  }

  try {
    const [batch] = await db
      .insert(migrationBatches)
      .values({
        startDate: start,
        endDate: end,
        status: "queued",
        concurrency: Math.min(Math.max(concurrency, 1), 10),
        createdBy: user.email ?? user.uid,
      })
      .returning();

    const schoolJobs = await Promise.all(
      schoolCodes.map(async (schoolCode) => {
        const schoolName = await getSchoolName(schoolCode);
        return {
          batchId: batch.id,
          schoolCode,
          schoolName,
          status: "pending" as const,
        };
      }),
    );

    const insertedJobs = await db
      .insert(migrationSchoolJobs)
      .values(schoolJobs)
      .returning();

    return Response.json({
      success: true,
      data: { batch, schoolJobs: insertedJobs },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create migration batch",
      },
      { status: 500 },
    );
  }
}
