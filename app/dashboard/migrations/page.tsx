"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiClient } from "@/lib/api-client";
import { DashboardHeader } from "@/components/dashboard-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TerminalLogViewer } from "@/components/terminal-log-viewer";
import { SchoolTableCell, SchoolTableHead } from "@/components/school-table-cell";
import { BatchDetailTabs, type BatchDetailTab } from "@/components/batch-detail-tabs";
import { TableSortButton } from "@/components/table-sort-button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils/format-bytes";
import { sortRows, sortRowsByStatus } from "@/lib/utils/sort-table-rows";

type School = {
  schoolCode: string;
  schoolYear?: string;
  schoolName?: string;
};

type SchoolJob = {
  id: string;
  schoolCode: string;
  schoolName: string;
  status: string;
  collected: number;
  transferred: number;
  skipped: number;
  failed: number;
  pending: number;
};

type BatchDetail = {
  batch: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    concurrency: number;
  };
  schoolJobs: SchoolJob[];
};

type LogEntry = {
  id: string;
  tag: string;
  message: string;
  createdAt: string;
};

type BatchAnalytics = {
  overall: {
    totalTransferredFiles: number;
    totalSkippedFiles: number;
    totalFailedFiles: number;
    totalPendingFiles: number;
    totalTransferredBytes: number;
    schoolCount: number;
  };
  schools: {
    schoolJobId: string;
    schoolCode: string;
    schoolName: string;
    status: string;
    transferred: number;
    skipped: number;
    failed: number;
    pending: number;
    transferredBytes: number;
  }[];
};

type BatchSummary = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  concurrency: number;
  createdAt: string;
  schoolCount: number;
  completedSchools: number;
  totalTransferred: number;
  totalPending: number;
};

type AnalyticsSortColumn =
  | "school"
  | "status"
  | "transferred"
  | "size"
  | "pending"
  | "failed";

type ActiveBatchSortColumn =
  | "school"
  | "status"
  | "collected"
  | "transferred"
  | "pending"
  | "failed"
  | "skipped";

type SortState<T extends string> = {
  column: T;
  order: "asc" | "desc";
};

function statusVariant(status: string) {
  switch (status) {
    case "completed":
      return "default";
    case "running":
    case "transferring":
    case "collecting":
      return "secondary";
    case "failed":
      return "destructive";
    case "paused":
      return "outline";
    default:
      return "outline";
  }
}

export default function MigrationsDashboardPage() {
  const { data: session, status } = useSession();
  const api = useApiClient();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeBatch, setActiveBatch] = useState<BatchDetail | null>(null);
  const [batchAnalytics, setBatchAnalytics] = useState<BatchAnalytics | null>(null);
  const [batchHistory, setBatchHistory] = useState<BatchSummary[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [batchDetailTab, setBatchDetailTab] = useState<BatchDetailTab>("active-batch");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchingSchools, setSearchingSchools] = useState(false);
  const [schoolFilesCode, setSchoolFilesCode] = useState("");
  const [analyticsSort, setAnalyticsSort] = useState<SortState<AnalyticsSortColumn>>({
    column: "school",
    order: "asc",
  });
  const [activeBatchSort, setActiveBatchSort] = useState<SortState<ActiveBatchSortColumn>>({
    column: "school",
    order: "asc",
  });

  const selectedCodes = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([code]) => code),
    [selected],
  );

  useEffect(() => {
    if (selectedCodes.length === 1) {
      setSchoolFilesCode(selectedCodes[0]);
    }
  }, [selectedCodes]);

  const filteredSchools = useMemo(() => {
    const query = schoolSearch.trim().toLowerCase();
    if (!query) return schools;

    return schools.filter((school) => {
      const haystack = [school.schoolCode, school.schoolName, school.schoolYear]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [schools, schoolSearch]);

  const sortedAnalyticsSchools = useMemo(() => {
    if (!batchAnalytics) return [];

    const rows = batchAnalytics.schools;
    const { column, order } = analyticsSort;

    switch (column) {
      case "school":
        return sortRows(rows, order, (row) => row.schoolCode);
      case "status":
        return sortRowsByStatus(rows, order, (row) => row.status);
      case "transferred":
        return sortRows(rows, order, (row) => row.transferred);
      case "size":
        return sortRows(rows, order, (row) => row.transferredBytes);
      case "pending":
        return sortRows(rows, order, (row) => row.pending);
      case "failed":
        return sortRows(rows, order, (row) => row.failed);
      default:
        return rows;
    }
  }, [batchAnalytics, analyticsSort]);

  const sortedActiveBatchJobs = useMemo(() => {
    if (!activeBatch) return [];

    const rows = activeBatch.schoolJobs;
    const { column, order } = activeBatchSort;

    switch (column) {
      case "school":
        return sortRows(rows, order, (job) => job.schoolCode);
      case "status":
        return sortRowsByStatus(rows, order, (job) => job.status);
      case "collected":
        return sortRows(rows, order, (job) => job.collected);
      case "transferred":
        return sortRows(rows, order, (job) => job.transferred);
      case "pending":
        return sortRows(rows, order, (job) => job.pending);
      case "failed":
        return sortRows(rows, order, (job) => job.failed);
      case "skipped":
        return sortRows(rows, order, (job) => job.skipped);
      default:
        return rows;
    }
  }, [activeBatch, activeBatchSort]);

  function handleAnalyticsSort(column: AnalyticsSortColumn) {
    setAnalyticsSort((current) => ({
      column,
      order: current.column === column && current.order === "asc" ? "desc" : "asc",
    }));
  }

  function handleActiveBatchSort(column: ActiveBatchSortColumn) {
    setActiveBatchSort((current) => ({
      column,
      order: current.column === column && current.order === "asc" ? "desc" : "asc",
    }));
  }

  function selectAllSchools() {
    setSelected((prev) => ({
      ...prev,
      ...Object.fromEntries(filteredSchools.map((school) => [school.schoolCode, true])),
    }));
  }

  function unselectAllSchools() {
    setSelected((prev) => ({
      ...prev,
      ...Object.fromEntries(filteredSchools.map((school) => [school.schoolCode, false])),
    }));
  }

  async function loadBatchDetail(batchId: string) {
    const detail = await api.fetch(`/api/migrations/${batchId}`);
    setActiveBatch(detail.data);
    return detail.data as BatchDetail;
  }

  async function loadBatchAnalytics(batchId: string) {
    const response = await api.fetch(`/api/migrations/${batchId}/analytics`);
    setBatchAnalytics(response.data);
    return response.data as BatchAnalytics;
  }

  async function refreshBatchHistory() {
    const response = await api.fetch("/api/migrations");
    setBatchHistory(response.data);
    return response.data as BatchSummary[];
  }

  useEffect(() => {
    if (status !== "authenticated") return;

    async function restoreState() {
      try {
        const [activeResponse] = await Promise.all([
          api.fetch("/api/migrations/active"),
          refreshBatchHistory(),
        ]);

        if (activeResponse.data) {
          setActiveBatch(activeResponse.data);
          void loadBatchAnalytics(activeResponse.data.batch.id);
        }
      } catch {
        // ignore restore errors
      }
    }

    void restoreState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const batchId = activeBatch?.batch.id;
    if (!batchId) return;

    const interval = setInterval(async () => {
      try {
        const [detailResponse] = await Promise.all([
          api.fetch(`/api/migrations/${batchId}`),
          loadBatchAnalytics(batchId),
        ]);
        setActiveBatch(detailResponse.data);
      } catch {
        // ignore polling errors
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeBatch?.batch.id, api]);

  useEffect(() => {
    const batchId = activeBatch?.batch.id;
    if (!expandedJobId || !batchId) return;

    async function loadLogs() {
      try {
        const response = await api.fetch(
          `/api/migrations/${batchId}/logs?schoolJobId=${expandedJobId}`,
        );
        setLogs(response.data);
      } catch {
        setLogs([]);
      }
    }

    loadLogs();
    const interval = setInterval(loadLogs, 4000);
    return () => clearInterval(interval);
  }, [expandedJobId, activeBatch?.batch.id, api]);

  async function handleSearchSchools() {
    setSearchingSchools(true);
    setMessage("");
    try {
      const response = await api.fetch(
        `/api/schools?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      );
      setSchools(response.data);
      setSchoolSearch("");
      const nextSelected: Record<string, boolean> = {};
      for (const school of response.data as School[]) {
        nextSelected[school.schoolCode] = true;
      }
      setSelected(nextSelected);
      setMessage(`Found ${response.data.length} schools`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to fetch schools");
    } finally {
      setSearchingSchools(false);
    }
  }

  async function handleStartMigration() {
    if (!startDate || !endDate || selectedCodes.length === 0) {
      setMessage("Select a date range and at least one school");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await api.fetch("/api/migrations", {
        method: "POST",
        body: JSON.stringify({
          startDate,
          endDate,
          schoolCodes: selectedCodes,
          concurrency: 5,
        }),
      });
      await loadBatchDetail(response.data.batch.id);
      await loadBatchAnalytics(response.data.batch.id);
      await refreshBatchHistory();
      setMessage(
        `Migration batch started with ${selectedCodes.length} schools. It runs on the server and continues if you reload or sign out.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start migration");
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchAction(action: "pause" | "resume" | "cancel") {
    if (!activeBatch) return;
    setBusy(true);
    try {
      await api.fetch(`/api/migrations/${activeBatch.batch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await loadBatchDetail(activeBatch.batch.id);
      await loadBatchAnalytics(activeBatch.batch.id);
      await refreshBatchHistory();
      setMessage(`Batch ${action}d`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Failed to ${action} batch`);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <DashboardHeader />

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Find Schools</CardTitle>
              <CardDescription>Filter by class creation date range</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSearchSchools}
                disabled={busy || searchingSchools}
              >
                {searchingSchools ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search schools"
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>Schools ({schools.length})</CardTitle>
                  <CardDescription>
                    {selectedCodes.length} selected
                    {schoolSearch.trim() && filteredSchools.length !== schools.length
                      ? ` · showing ${filteredSchools.length}`
                      : ""}
                  </CardDescription>
                </div>
                {schools.length > 0 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllSchools}
                      disabled={busy}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={unselectAllSchools}
                      disabled={busy}
                    >
                      Unselect all
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {schools.length > 0 ? (
                <Input
                  type="search"
                  placeholder="Search by school code, name, or year..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                />
              ) : null}
              <div className="max-h-[420px] space-y-3 overflow-y-auto">
              {filteredSchools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {schools.length === 0
                    ? "Search by date range to load schools."
                    : "No schools match your search."}
                </p>
              ) : null}
              {filteredSchools.map((school) => (
                <label
                  key={school.schoolCode}
                  className="flex cursor-pointer items-start gap-3 glass-item p-3"
                >
                  <Checkbox
                    checked={Boolean(selected[school.schoolCode])}
                    onCheckedChange={(checked) =>
                      setSelected((prev) => ({
                        ...prev,
                        [school.schoolCode]: Boolean(checked),
                      }))
                    }
                  />
                  <div>
                    <p className="font-medium">{school.schoolCode}</p>
                    <p className="text-sm text-muted-foreground">{school.schoolName}</p>
                    {school.schoolYear ? (
                      <p className="text-xs text-muted-foreground/70">{school.schoolYear}</p>
                    ) : null}
                  </div>
                </label>
              ))}
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={handleStartMigration} disabled={busy}>
            Start migration (5 parallel schools)
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Collected files by school</CardTitle>
              <CardDescription>
                View distinct file paths across all migration batches for one school
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="schoolFilesCode">School code</Label>
                <Input
                  id="schoolFilesCode"
                  placeholder="Enter school code..."
                  value={schoolFilesCode}
                  onChange={(e) => setSchoolFilesCode(e.target.value.trim())}
                />
              </div>
              <Link
                href={
                  schoolFilesCode
                    ? `/dashboard/schools/${encodeURIComponent(schoolFilesCode)}/files`
                    : "#"
                }
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full",
                  !schoolFilesCode && "pointer-events-none opacity-50",
                )}
                aria-disabled={!schoolFilesCode}
              >
                View all collected files
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {message ? (
            <div className="glass-panel px-4 py-3 text-sm">{message}</div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Migration Batches</CardTitle>
              <CardDescription>
                Migrations run on the server and continue after reload or sign out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No migration batches yet.</p>
              ) : (
                <div className="glass-scroll-panel space-y-2">
                  {batchHistory.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => {
                        void loadBatchDetail(batch.id);
                        void loadBatchAnalytics(batch.id);
                      }}
                      className={`flex w-full items-center justify-between p-3 text-left glass-item ${
                        activeBatch?.batch.id === batch.id ? "glass-item-active" : ""
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(batch.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.completedSchools}/{batch.schoolCount} schools ·{" "}
                          {batch.totalTransferred} transferred · {batch.totalPending} pending
                        </p>
                      </div>
                      <Badge variant={statusVariant(batch.status)}>{batch.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <BatchDetailTabs value={batchDetailTab} onChange={setBatchDetailTab} />
              {batchDetailTab === "analytics" ? (
                <div>
                  <CardTitle>Transfer Analytics</CardTitle>
                  <CardDescription>
                    Total data migrated to Huawei OBS for this batch
                  </CardDescription>
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Active Batch</CardTitle>
                    <CardDescription>
                      {activeBatch
                        ? `Status: ${activeBatch.batch.status} | Concurrency: ${activeBatch.batch.concurrency}`
                        : "No active batch selected"}
                    </CardDescription>
                  </div>
                  {activeBatch ? (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/migrations/${activeBatch.batch.id}/files`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        View collected files
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBatchAction("pause")}
                        disabled={busy || activeBatch.batch.status !== "running"}
                      >
                        Pause
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBatchAction("resume")}
                        disabled={busy || activeBatch.batch.status !== "paused"}
                      >
                        Resume
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleBatchAction("cancel")}
                        disabled={
                          busy || ["completed", "cancelled"].includes(activeBatch.batch.status)
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {batchDetailTab === "analytics" ? (
                !activeBatch || !batchAnalytics ? (
                  <p className="text-sm text-muted-foreground">
                    Select a migration batch to view transfer analytics.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="glass-stat">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total size
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {formatBytes(batchAnalytics.overall.totalTransferredBytes)}
                        </p>
                      </div>
                      <div className="glass-stat">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Files transferred
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {batchAnalytics.overall.totalTransferredFiles.toLocaleString()}
                        </p>
                      </div>
                      <div className="glass-stat">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Schools
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {batchAnalytics.overall.schoolCount.toLocaleString()}
                        </p>
                      </div>
                      <div className="glass-stat">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Pending files
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {batchAnalytics.overall.totalPendingFiles.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="glass-table-scroll">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow>
                            <SchoolTableHead
                              sortActive={analyticsSort.column === "school"}
                              sortOrder={analyticsSort.order}
                              onSort={() => handleAnalyticsSort("school")}
                            />
                            <TableHead className="w-24">
                              <TableSortButton
                                label="Status"
                                active={analyticsSort.column === "status"}
                                sortOrder={analyticsSort.order}
                                onClick={() => handleAnalyticsSort("status")}
                              />
                            </TableHead>
                            <TableHead className="w-32">
                              <TableSortButton
                                label="Files transferred"
                                active={analyticsSort.column === "transferred"}
                                sortOrder={analyticsSort.order}
                                onClick={() => handleAnalyticsSort("transferred")}
                              />
                            </TableHead>
                            <TableHead className="w-28">
                              <TableSortButton
                                label="Total size"
                                active={analyticsSort.column === "size"}
                                sortOrder={analyticsSort.order}
                                onClick={() => handleAnalyticsSort("size")}
                              />
                            </TableHead>
                            <TableHead className="w-24">
                              <TableSortButton
                                label="Pending"
                                active={analyticsSort.column === "pending"}
                                sortOrder={analyticsSort.order}
                                onClick={() => handleAnalyticsSort("pending")}
                              />
                            </TableHead>
                            <TableHead className="w-20">
                              <TableSortButton
                                label="Failed"
                                active={analyticsSort.column === "failed"}
                                sortOrder={analyticsSort.order}
                                onClick={() => handleAnalyticsSort("failed")}
                              />
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedAnalyticsSchools.map((school) => (
                            <TableRow key={school.schoolJobId}>
                              <SchoolTableCell
                                schoolCode={school.schoolCode}
                                schoolName={school.schoolName}
                              />
                              <TableCell>
                                <Badge variant={statusVariant(school.status)}>{school.status}</Badge>
                              </TableCell>
                              <TableCell>{school.transferred.toLocaleString()}</TableCell>
                              <TableCell className="font-medium">
                                {formatBytes(school.transferredBytes)}
                              </TableCell>
                              <TableCell>{school.pending.toLocaleString()}</TableCell>
                              <TableCell>{school.failed.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )
              ) : !activeBatch ? (
                <p className="text-sm text-muted-foreground">
                  Start a migration to see per-school progress here.
                </p>
              ) : (
                <>
                  <div className="glass-table-scroll">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <SchoolTableHead
                            sortActive={activeBatchSort.column === "school"}
                            sortOrder={activeBatchSort.order}
                            onSort={() => handleActiveBatchSort("school")}
                          />
                          <TableHead className="w-24">
                            <TableSortButton
                              label="Status"
                              active={activeBatchSort.column === "status"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("status")}
                            />
                          </TableHead>
                          <TableHead className="w-24">
                            <TableSortButton
                              label="Collected"
                              active={activeBatchSort.column === "collected"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("collected")}
                            />
                          </TableHead>
                          <TableHead className="w-24">
                            <TableSortButton
                              label="Transferred"
                              active={activeBatchSort.column === "transferred"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("transferred")}
                            />
                          </TableHead>
                          <TableHead className="w-24">
                            <TableSortButton
                              label="Pending"
                              active={activeBatchSort.column === "pending"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("pending")}
                            />
                          </TableHead>
                          <TableHead className="w-20">
                            <TableSortButton
                              label="Failed"
                              active={activeBatchSort.column === "failed"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("failed")}
                            />
                          </TableHead>
                          <TableHead className="w-20">
                            <TableSortButton
                              label="Skipped"
                              active={activeBatchSort.column === "skipped"}
                              sortOrder={activeBatchSort.order}
                              onClick={() => handleActiveBatchSort("skipped")}
                            />
                          </TableHead>
                          <TableHead className="w-20">Logs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedActiveBatchJobs.map((job) => {
                          const isViewing = expandedJobId === job.id;

                          return (
                          <TableRow
                            key={job.id}
                            data-state={isViewing ? "selected" : undefined}
                            className={cn(isViewing && "glass-table-row-active")}
                          >
                            <SchoolTableCell
                              schoolCode={job.schoolCode}
                              schoolName={job.schoolName}
                            />
                            <TableCell>
                              <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                            </TableCell>
                            <TableCell>{job.collected}</TableCell>
                            <TableCell>{job.transferred}</TableCell>
                            <TableCell>{job.pending}</TableCell>
                            <TableCell>{job.failed}</TableCell>
                            <TableCell>{job.skipped}</TableCell>
                            <TableCell>
                              <Button
                                variant={isViewing ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() =>
                                  setExpandedJobId(isViewing ? null : job.id)
                                }
                              >
                                {isViewing ? "Hide" : "View"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {expandedJobId ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground/90">Migration Logs</p>
                      <TerminalLogViewer
                        title={`${activeBatch.schoolJobs.find((job) => job.id === expandedJobId)?.schoolCode ?? "school"}.log`}
                        subtitle={
                          activeBatch.schoolJobs.find((job) => job.id === expandedJobId)?.schoolName
                        }
                        logs={logs}
                        emptyMessage="No log output yet. Logs will stream here while migration runs."
                      />
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
