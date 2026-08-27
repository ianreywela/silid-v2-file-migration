import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationLogs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  await context.params;
  const { searchParams } = request.nextUrl;
  const schoolJobId = searchParams.get("schoolJobId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  if (!schoolJobId) {
    return Response.json({ success: false, error: "schoolJobId is required" }, { status: 400 });
  }

  const logs = await db
    .select()
    .from(migrationLogs)
    .where(eq(migrationLogs.schoolJobId, schoolJobId))
    .orderBy(desc(migrationLogs.createdAt))
    .limit(limit);

  return Response.json({ success: true, data: logs.reverse() });
}
