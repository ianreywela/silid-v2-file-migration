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

type SchoolOption = {
  id: string;
  schoolCode: string;
  schoolName: string;
};

type CollectedFile = {
  id: string;
  filePath: string;
  status: string;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  transferredAt: string | null;
  schoolJobId: string;
  schoolCode: string;
  schoolName: string;
  category: string;
};

type SortColumn = "filename" | "status" | "category" | "size" | "school" | "transferredAt";

type CollectedFilesTableProps = {
  batchId: string;
  schools: SchoolOption[];
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

export function CollectedFilesTable({ batchId, schools }: CollectedFilesTableProps) {
  const api = useApiClient();

  const [files, setFiles] = useState<CollectedFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [filename, setFilename] = useState("");
  const [debouncedFilename, setDebouncedFilename] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [schoolCode, setSchoolCode] = useState("all");
  const [sortBy, setSortBy] = useState<SortColumn>("filename");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [sizeSummary, setSizeSummary] = useState<FilesSizeSummary>(EMPTY_FILES_SIZE_SUMMARY);
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
          schoolCode,
        });

        if (debouncedFilename) {
          params.set("filename", debouncedFilename);
        }

        const response = await api.fetch(
          `/api/migrations/${batchId}/files?${params.toString()}`,
          { signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        setFiles(response.data.files);
        setCategories(response.data.categories);
        setPagination(response.data.pagination);
        setSizeSummary(response.data.sizeSummary ?? EMPTY_FILES_SIZE_SUMMARY);
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
    const interval = setInterval(fetchFiles, 5000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [api, batchId, page, sortBy, sortOrder, status, category, schoolCode, debouncedFilename]);

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
        <CardTitle>Collected Files</CardTitle>
        <CardDescription>
          Browse collected files per school with filters and sorting
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilesSizeSummaryBar summary={sizeSummary} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="file-filename">Filename</Label>
            <Input
              id="file-filename"
              placeholder="Search filename or path..."
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file-school">School</Label>
            <select
              id="file-school"
              className="glass-select"
              value={schoolCode}
              onChange={(e) => {
                setSchoolCode(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.schoolCode}>
                  {school.schoolCode}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="file-status">Status</Label>
            <select
              id="file-status"
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
            <Label htmlFor="file-category">Belongs to</Label>
            <select
              id="file-category"
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

        <div className="glass-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton
                    label="Filename"
                    column="filename"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Belongs to"
                    column="category"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="School"
                    column="school"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Status"
                    column="status"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortButton
                    label="Size"
                    column="size"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
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
                    No files match your filters.
                  </TableCell>
                </TableRow>
              ) : null}
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium" title={getFileNameFromPath(file.filePath)}>
                      {getFileNameFromPath(file.filePath)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={file.filePath}>
                      {file.filePath}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{file.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{file.schoolCode}</p>
                      <p className="text-xs text-muted-foreground">{file.schoolName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(file.status)}>{file.status}</Badge>
                  </TableCell>
                  <TableCell>{formatBytes(file.fileSizeBytes ?? 0)}</TableCell>
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
