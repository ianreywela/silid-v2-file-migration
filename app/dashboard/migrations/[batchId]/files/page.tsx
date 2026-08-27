"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CollectedFilesTable } from "@/components/collected-files-table";
import { DashboardHeader } from "@/components/dashboard-header";
import { buttonVariants } from "@/components/ui/button";
import { useApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SchoolJob = {
  id: string;
  schoolCode: string;
  schoolName: string;
};

type BatchDetail = {
  batch: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt?: string;
  };
  schoolJobs: SchoolJob[];
};

export default function CollectedFilesPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const api = useApiClient();

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !batchId) return;

    async function loadBatch() {
      try {
        const response = await api.fetch(`/api/migrations/${batchId}`);
        setBatch(response.data);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load batch");
        setBatch(null);
      }
    }

    void loadBatch();
  }, [api, batchId, status]);

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

  const batchLabel = batch
    ? `${batch.batch.startDate} → ${batch.batch.endDate} · ${batch.batch.status}`
    : "Loading batch...";

  return (
    <div className="min-h-screen">
      <DashboardHeader
        title="Collected Files"
        subtitle={batchLabel}
        backHref="/dashboard/migrations"
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {error ? (
          <div className="glass-panel px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {batch ? (
          <CollectedFilesTable
            batchId={batch.batch.id}
            schools={batch.schoolJobs.map((job) => ({
              id: job.id,
              schoolCode: job.schoolCode,
              schoolName: job.schoolName,
            }))}
          />
        ) : !error ? (
          <p className="text-sm text-muted-foreground">Loading collected files...</p>
        ) : (
          <Link
            href="/dashboard/migrations"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Return to migrations
          </Link>
        )}
      </main>
    </div>
  );
}
