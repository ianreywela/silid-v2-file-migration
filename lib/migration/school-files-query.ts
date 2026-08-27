import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { migrationFilePaths, migrationSchoolJobs } from "@/drizzle/schema";
import { getObjectSizeBytes } from "@/lib/storage/object-metadata";
import {
  type FilesSizeSummary,
} from "@/lib/migration/file-size-summary";

export const SCHOOL_FILE_STATUSES = ["pending", "transferred", "skipped", "failed"] as const;
export type SchoolFileStatus = (typeof SCHOOL_FILE_STATUSES)[number];

export const SCHOOL_FILE_SORT_COLUMNS = [
  "filename",
  "status",
  "category",
  "size",
  "transferredAt",
] as const;
export type SchoolFileSortColumn = (typeof SCHOOL_FILE_SORT_COLUMNS)[number];

export type SchoolFilesQuery = {
  schoolCode: string;
  filename?: string;
  status?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  resolveSize?: boolean;
};

const categoryExpr = sql<string>`split_part(${migrationFilePaths.filePath}, '/', 1)`;

const statusAggExpr = sql<string>`(array_agg(${migrationFilePaths.status}::text ORDER BY
  CASE ${migrationFilePaths.status}::text
    WHEN 'transferred' THEN 1
    WHEN 'pending' THEN 2
    WHEN 'failed' THEN 3
    ELSE 4
  END
))[1]`;

function isSchoolFileStatus(value: string): value is SchoolFileStatus {
  return SCHOOL_FILE_STATUSES.includes(value as SchoolFileStatus);
}

function isSchoolFileSortColumn(value: string): value is SchoolFileSortColumn {
  return SCHOOL_FILE_SORT_COLUMNS.includes(value as SchoolFileSortColumn);
}

export async function queryDistinctSchoolFiles(query: SchoolFilesQuery) {
  const schoolCode = query.schoolCode.trim();
  const sortBy = isSchoolFileSortColumn(query.sortBy ?? "")
    ? (query.sortBy as SchoolFileSortColumn)
    : "filename";
  const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(10, query.limit ?? 25));
  const offset = (page - 1) * limit;

  const baseConditions: SQL[] = [eq(migrationSchoolJobs.schoolCode, schoolCode)];

  if (query.filename) {
    baseConditions.push(ilike(migrationFilePaths.filePath, `%${query.filename}%`));
  }

  if (query.category && query.category !== "all") {
    baseConditions.push(sql`${categoryExpr} = ${query.category}`);
  }

  const groupedFiles = db
    .select({
      filePath: migrationFilePaths.filePath,
      fileSizeBytes: sql<number | null>`max(${migrationFilePaths.fileSizeBytes})`.as(
        "file_size_bytes",
      ),
      status: statusAggExpr.as("status"),
      transferredAt: sql<Date | null>`max(${migrationFilePaths.transferredAt})`.as(
        "transferred_at",
      ),
      category: categoryExpr.as("category"),
      schoolCode: migrationSchoolJobs.schoolCode,
      schoolName: sql<string>`max(${migrationSchoolJobs.schoolName})`.as("school_name"),
      batchCount: sql<number>`count(distinct ${migrationSchoolJobs.batchId})::int`.as(
        "batch_count",
      ),
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(and(...baseConditions))
    .groupBy(migrationFilePaths.filePath, migrationSchoolJobs.schoolCode)
    .as("grouped_files");

  const havingConditions: SQL[] = [];
  if (query.status && query.status !== "all" && isSchoolFileStatus(query.status)) {
    havingConditions.push(sql`${groupedFiles.status} = ${query.status}`);
  }

  const whereGrouped =
    havingConditions.length > 0 ? and(...havingConditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int`.as("total") })
    .from(groupedFiles)
    .where(whereGrouped);

  const [statusSummaryRow] = await db
    .select({
      transferredCount:
        sql<number>`count(*) filter (where ${groupedFiles.status} = 'transferred')::int`.as(
          "transferred_count",
        ),
      transferredBytes:
        sql<number>`coalesce(sum(${groupedFiles.fileSizeBytes}) filter (where ${groupedFiles.status} = 'transferred'), 0)::bigint`.as(
          "transferred_bytes",
        ),
      pendingCount:
        sql<number>`count(*) filter (where ${groupedFiles.status} = 'pending')::int`.as(
          "pending_count",
        ),
      pendingBytes:
        sql<number>`coalesce(sum(${groupedFiles.fileSizeBytes}) filter (where ${groupedFiles.status} = 'pending'), 0)::bigint`.as(
          "pending_bytes",
        ),
      failedCount:
        sql<number>`count(*) filter (where ${groupedFiles.status} = 'failed')::int`.as(
          "failed_count",
        ),
      failedBytes:
        sql<number>`coalesce(sum(${groupedFiles.fileSizeBytes}) filter (where ${groupedFiles.status} = 'failed'), 0)::bigint`.as(
          "failed_bytes",
        ),
      overallCount: sql<number>`count(*)::int`.as("overall_count"),
      overallBytes:
        sql<number>`coalesce(sum(${groupedFiles.fileSizeBytes}), 0)::bigint`.as("overall_bytes"),
    })
    .from(groupedFiles)
    .where(whereGrouped);

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

  const orderByClause = (() => {
    const direction = sortOrder === "desc" ? desc : asc;
    switch (sortBy) {
      case "status":
        return direction(groupedFiles.status);
      case "size":
        return direction(groupedFiles.fileSizeBytes);
      case "category":
        return direction(groupedFiles.category);
      case "transferredAt":
        return direction(groupedFiles.transferredAt);
      case "filename":
      default:
        return direction(groupedFiles.filePath);
    }
  })();

  const rows = await db
    .select()
    .from(groupedFiles)
    .where(whereGrouped)
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset);

  type DistinctSchoolFile = {
    id: string;
    filePath: string;
    status: string;
    fileSizeBytes: number | null;
    errorMessage: string | null;
    transferredAt: string | null;
    schoolCode: string;
    schoolName: string;
    category: string;
    batchCount: number;
  };

  let files: DistinctSchoolFile[] = rows.map((row) => {
    const record = row as {
      filePath: string;
      fileSizeBytes: number | null;
      status: string;
      transferredAt: Date | string | null;
      schoolCode: string;
      schoolName: string;
      category: string;
      batchCount: number;
    };

    return {
      id: record.filePath,
      filePath: record.filePath,
      status: record.status,
      fileSizeBytes: record.fileSizeBytes == null ? null : Number(record.fileSizeBytes),
      errorMessage: null,
      transferredAt: record.transferredAt
        ? new Date(record.transferredAt).toISOString()
        : null,
      schoolCode: record.schoolCode,
      schoolName: record.schoolName,
      category: record.category,
      batchCount: Number(record.batchCount),
    };
  });

  if (query.resolveSize) {
    files = await Promise.all(
      files.map(async (file) => {
        if (file.fileSizeBytes != null && file.fileSizeBytes > 0) {
          return file;
        }
        const size = await getObjectSizeBytes(file.filePath);
        return { ...file, fileSizeBytes: size };
      }),
    );
  }

  const categoryRows = await db
    .selectDistinct({ category: categoryExpr })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(eq(migrationSchoolJobs.schoolCode, schoolCode))
    .orderBy(categoryExpr);

  const categories = categoryRows
    .map((row) => row.category)
    .filter((value) => value && value.length > 0);

  const distinctPaths = db
    .select({
      fileSizeBytes: sql<number | null>`max(${migrationFilePaths.fileSizeBytes})`.as(
        "file_size_bytes",
      ),
      schoolName: sql<string>`max(${migrationSchoolJobs.schoolName})`.as("school_name"),
    })
    .from(migrationFilePaths)
    .innerJoin(
      migrationSchoolJobs,
      eq(migrationFilePaths.schoolJobId, migrationSchoolJobs.id),
    )
    .where(eq(migrationSchoolJobs.schoolCode, schoolCode))
    .groupBy(migrationFilePaths.filePath)
    .as("distinct_paths");

  const [schoolMeta] = await db
    .select({
      schoolName: sql<string>`max(${distinctPaths.schoolName})`.as("school_name"),
      distinctFiles: sql<number>`count(*)::int`.as("distinct_files"),
      totalBytes: sql<number>`coalesce(sum(${distinctPaths.fileSizeBytes}), 0)::bigint`.as(
        "total_bytes",
      ),
    })
    .from(distinctPaths);

  return {
    schoolCode,
    schoolName: schoolMeta?.schoolName ?? schoolCode,
    summary: {
      distinctFiles: schoolMeta?.distinctFiles ?? 0,
      totalBytes: Number(schoolMeta?.totalBytes ?? 0),
      sizeSummary,
    },
    files,
    categories,
    pagination: {
      page,
      limit,
      total: total ?? 0,
      totalPages: Math.max(1, Math.ceil((total ?? 0) / limit)),
    },
    sort: { sortBy, sortOrder },
  };
}
