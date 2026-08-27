import { NextRequest } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationBatches, migrationSchoolJobs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";
import { rerunFailedSchoolJobs, setBatchStatus } from "@/lib/migration/repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;

  const [batch] = await db
    .select()
    .from(migrationBatches)
    .where(eq(migrationBatches.id, id))
    .limit(1);

  if (!batch) {
    return Response.json({ success: false, error: "Batch not found" }, { status: 404 });
  }

  const schoolJobs = await db
    .select()
    .from(migrationSchoolJobs)
    .where(eq(migrationSchoolJobs.batchId, id))
    .orderBy(migrationSchoolJobs.schoolCode);

  return Response.json({ success: true, data: { batch, schoolJobs } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const body = await request.json();
  const { action } = body as { action: "pause" | "resume" | "cancel" | "rerun" };

  if (!["pause", "resume", "cancel", "rerun"].includes(action)) {
    return Response.json({ success: false, error: "Invalid action" }, { status: 400 });
  }

  const [batch] = await db
    .select()
    .from(migrationBatches)
    .where(eq(migrationBatches.id, id))
    .limit(1);

  if (!batch) {
    return Response.json({ success: false, error: "Batch not found" }, { status: 404 });
  }

  if (action === "rerun") {
    const restarted = await rerunFailedSchoolJobs(id);
    if (restarted === 0) {
      return Response.json(
        { success: false, error: "No failed school jobs to re-run" },
        { status: 400 },
      );
    }
    await setBatchStatus(id, "running");
  } else {
    const statusMap = {
      pause: "paused",
      resume: "running",
      cancel: "cancelled",
    } as const;

    const nextStatus = statusMap[action as keyof typeof statusMap];

    await db
      .update(migrationBatches)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(migrationBatches.id, id));
  }

  if (action === "resume") {
    await db
      .update(migrationSchoolJobs)
      .set({ status: "pending", updatedAt: new Date() })
      .where(
        and(
          eq(migrationSchoolJobs.batchId, id),
          sql`${migrationSchoolJobs.status} in ('paused', 'failed')`,
        ),
      );
  }

  if (action === "pause") {
    await db
      .update(migrationSchoolJobs)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(migrationSchoolJobs.batchId, id),
          sql`${migrationSchoolJobs.status} in ('pending', 'collecting', 'transferring')`,
        ),
      );
  }

  const [updated] = await db
    .select()
    .from(migrationBatches)
    .where(eq(migrationBatches.id, id))
    .limit(1);

  return Response.json({ success: true, data: updated });
}
