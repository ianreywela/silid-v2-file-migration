"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiClient } from "@/lib/api-client";
import { FilesSizeSummaryBar } from "@/components/files-size-summary";
import { getFileNameFromPath } from "@/lib/migration/file-path-utils";
import {
  EMPTY_FILES_SIZE_SUMMARY,
  type FilesSizeSummary,
} from "@/lib/migration/file-size-summary";
import { formatBytes } from "@/lib/utils/format-bytes";
import { formatPaginationRange } from "@/lib/utils/pagination-range";

type CollectedFile = {
  id: string;
  filePath: string;
  status: string;
  fileSizeBytes: number | null;
  transferredAt: string | null;
  category: string;
  batchCount: number;
};

type SortColumn = "filename" | "status" | "category" | "size" | "transferredAt";

type SchoolCollectedFilesTableProps = {
  schoolCode: string;
  schoolName?: string;
};

function statusVariant(status: string) {
  switch (status) {
    case "transferred":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    case "skipped":
      return "outline";
    default:
      return "outline";
  }
}

function SortButton({
  label,
  column,
  activeColumn,
  sortOrder,
  onSort,
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  sortOrder: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const isActive = activeColumn === column;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium text-foreground/90 hover:text-foreground"
      onClick={() => onSort(column)}
    >
      {label}
      <span className="text-xs text-muted-foreground">
        {isActive ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

export function SchoolCollectedFilesTable({
  schoolCode,
  schoolName,
}: SchoolCollectedFilesTableProps) {
  const api = useApiClient();

  const [files, setFiles] = useState<CollectedFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState({ distinctFiles: 0, totalBytes: 0 });
  const [sizeSummary, setSizeSummary] = useState<FilesSizeSummary>(EMPTY_FILES_SIZE_SUMMARY);
  const [resolvedSchoolName, setResolvedSchoolName] = useState(schoolName ?? schoolCode);
  const [loading, setLoading] = useState(false);

  const [filename, setFilename] = useState("");
  const [debouncedFilename, setDebouncedFilename] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<SortColumn>("filename");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilename(filename);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filename]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    async function fetchFiles() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "25",
          sortBy,
          sortOrder,
          status,
          category,
          resolveSize: "true",
        });

        if (debouncedFilename) {
          params.set("filename", debouncedFilename);
        }

        const response = await api.fetch(
          `/api/schools/${encodeURIComponent(schoolCode)}/files?${params.toString()}`,
          { signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        setFiles(response.data.files);
        setCategories(response.data.categories);
        setPagination(response.data.pagination);
        setSummary(response.data.summary);
        setSizeSummary(response.data.summary?.sizeSummary ?? EMPTY_FILES_SIZE_SUMMARY);
        setResolvedSchoolName(response.data.schoolName ?? schoolName ?? schoolCode);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        setFiles([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    void fetchFiles();

    return () => {
      controller.abort();
    };
  }, [api, schoolCode, schoolName, page, sortBy, sortOrder, status, category, debouncedFilename]);

  function handleSort(column: SortColumn) {
    setPage(1);
    if (sortBy === column) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortOrder("asc");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collected Files — {schoolCode}</CardTitle>
        <CardDescription>
          {resolvedSchoolName} · {summary.distinctFiles.toLocaleString()} distinct paths across
          all migration batches · {formatBytes(summary.totalBytes)} known in database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilesSizeSummaryBar summary={sizeSummary} />

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="school-file-filename">Filename</Label>
            <Input
              id="school-file-filename"
              placeholder="Search filename or path..."
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="school-file-status">Status</Label>
            <select
              id="school-file-status"
              className="glass-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="transferred">Transferred</option>
              <option value="skipped">Skipped</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="school-file-category">Belongs to</Label>
            <select
              id="school-file-category"
              className="glass-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All locations</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="glass-table-scroll">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">
                  <SortButton
                    label="Filename"
                    column="filename"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-28">
                  <SortButton
                    label="Belongs to"
                    column="category"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-24">
                  <SortButton
                    label="Status"
                    column="status"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-24">
                  <SortButton
                    label="Size"
                    column="size"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-20">Batches</TableHead>
                <TableHead className="w-36">
                  <SortButton
                    label="Transferred at"
                    column="transferredAt"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading files...
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No collected files found for this school.
                  </TableCell>
                </TableRow>
              ) : null}
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="whitespace-normal">
                    <p className="truncate font-medium" title={getFileNameFromPath(file.filePath)}>
                      {getFileNameFromPath(file.filePath)}
                    </p>
                    <p
                      className="truncate text-xs text-muted-foreground [overflow-wrap:anywhere]"
                      title={file.filePath}
                    >
                      {file.filePath}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{file.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(file.status)}>{file.status}</Badge>
                  </TableCell>
                  <TableCell>{formatBytes(file.fileSizeBytes ?? 0)}</TableCell>
                  <TableCell>{file.batchCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {file.transferredAt
                      ? new Date(file.transferredAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {formatPaginationRange({
              page,
              limit: pagination.limit,
              total: pagination.total,
              label: "distinct files",
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-foreground/80">
              Page {page} of {Math.max(pagination.totalPages, 1)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || page >= Math.max(pagination.totalPages, 1)}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
