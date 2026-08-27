import { NextRequest } from "next/server";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationFilePaths, migrationSchoolJobs } from "@/drizzle/schema";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";
import type { FilesSizeSummary } from "@/lib/migration/file-size-summary";

type RouteContext = { params: Promise<{ id: string }> };

const FILE_STATUSES = ["pending", "transferred", "skipped", "failed"] as const;
type FileStatus = (typeof FILE_STATUSES)[number];

const SORT_COLUMNS = [
  "filename",
  "status",
  "category",
  "size",
  "school",
  "transferredAt",
] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

function isFileStatus(value: string): value is FileStatus {
  return FILE_STATUSES.includes(value as FileStatus);
}

function isSortColumn(value: string): value is SortColumn {
  return SORT_COLUMNS.includes(value as SortColumn);
}

function getOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const direction = sortOrder === "desc" ? desc : asc;

  switch (sortBy) {
    case "status":
      return direction(migrationFilePaths.status);
    case "size":
      return direction(migrationFilePaths.fileSizeBytes);
    case "school":
      return direction(migrationSchoolJobs.schoolCode);
    case "category":
      return direction(sql`split_part(${migrationFilePaths.filePath}, '/', 1)`);
    case "transferredAt":
      return direction(migrationFilePaths.transferredAt);
    case "filename":
    default:
      return direction(migrationFilePaths.filePath);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { id: batchId } = await context.params;
  const { searchParams } = request.nextUrl;

  const schoolJobId = searchParams.get("schoolJobId") ?? undefined;
  const schoolCode = searchParams.get("schoolCode") ?? undefined;
  const filename = searchParams.get("filename")?.trim() ?? undefined;
  const statusParam = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sortByParam = searchParams.get("sortBy") ?? "filename";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? 25)));
  const offset = (page - 1) * limit;

  const sortBy = isSortColumn(sortByParam) ? sortByParam : "filename";

  const conditions: SQL[] = [eq(migrationSchoolJobs.batchId, batchId)];

  if (schoolJobId) {
    conditions.push(eq(migrationFilePaths.schoolJobId, schoolJobId));
  }

  if (schoolCode && schoolCode !== "all") {
    conditions.push(eq(migrationSchoolJobs.schoolCode, schoolCode));
  }

  if (filename) {
    conditions.push(ilike(migrationFilePaths.filePath, `%${filename}%`));
  }

  if (statusParam !== "all" && isFileStatus(statusParam)) {
    conditions.push(eq(migrationFilePaths.status, statusParam));
  }

  if (category !== "all") {
    conditions.push(
      sql`split_part(${migrationFilePaths.filePath}, '/', 1) = ${category}`,
    );
  }

  const whereClause = and(...conditions);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(whereClause);

  const [statusSummaryRow] = await db
    .select({
      transferredCount:
        sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'transferred')::int`,
      transferredBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'transferred'), 0)::bigint`,
      pendingCount:
        sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'pending')::int`,
      pendingBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'pending'), 0)::bigint`,
      failedCount:
        sql<number>`count(*) filter (where ${migrationFilePaths.status} = 'failed')::int`,
      failedBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}) filter (where ${migrationFilePaths.status} = 'failed'), 0)::bigint`,
      overallCount: sql<number>`count(*)::int`,
      overallBytes:
        sql<number>`coalesce(sum(${migrationFilePaths.fileSizeBytes}), 0)::bigint`,
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(whereClause);

  const sizeSummary: FilesSizeSummary = {
    transferred: {
      files: statusSummaryRow?.transferredCount ?? 0,
      bytes: Number(statusSummaryRow?.transferredBytes ?? 0),
    },
    pending: {
      files: statusSummaryRow?.pendingCount ?? 0,
      bytes: Number(statusSummaryRow?.pendingBytes ?? 0),
    },
    failed: {
      files: statusSummaryRow?.failedCount ?? 0,
      bytes: Number(statusSummaryRow?.failedBytes ?? 0),
    },
    overall: {
      files: statusSummaryRow?.overallCount ?? 0,
      bytes: Number(statusSummaryRow?.overallBytes ?? 0),
    },
  };

  const files = await db
    .select({
      id: migrationFilePaths.id,
      filePath: migrationFilePaths.filePath,
      status: migrationFilePaths.status,
      fileSizeBytes: migrationFilePaths.fileSizeBytes,
      errorMessage: migrationFilePaths.errorMessage,
      transferredAt: migrationFilePaths.transferredAt,
      schoolJobId: migrationSchoolJobs.id,
      schoolCode: migrationSchoolJobs.schoolCode,
      schoolName: migrationSchoolJobs.schoolName,
      category: sql<string>`split_part(${migrationFilePaths.filePath}, '/', 1)`,
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(whereClause)
    .orderBy(getOrderBy(sortBy, sortOrder))
    .limit(limit)
    .offset(offset);

  const categoryRows = await db
    .selectDistinct({
      category: sql<string>`split_part(${migrationFilePaths.filePath}, '/', 1)`,
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(eq(migrationSchoolJobs.batchId, batchId))
    .orderBy(sql`split_part(${migrationFilePaths.filePath}, '/', 1)`);

  const categories = categoryRows
    .map((row) => row.category)
    .filter((value) => value && value.length > 0);

  return Response.json({
    success: true,
    data: {
      files,
      categories,
      sizeSummary,
      pagination: {
        page,
        limit,
        total: total ?? 0,
        totalPages: Math.max(1, Math.ceil((total ?? 0) / limit)),
      },
      sort: { sortBy, sortOrder },
    },
  });
}
