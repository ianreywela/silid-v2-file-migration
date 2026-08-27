"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardHeader } from "@/components/dashboard-header";
import { SchoolCollectedFilesTable } from "@/components/school-collected-files-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SchoolCollectedFilesPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ schoolCode: string }>();
  const schoolCode = decodeURIComponent(params.schoolCode ?? "");

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
      <DashboardHeader
        title="School Collected Files"
        subtitle={schoolCode}
        backHref="/dashboard/migrations"
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {!schoolCode ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">School code is required.</p>
            <Link
              href="/dashboard/migrations"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Back to migrations
            </Link>
          </div>
        ) : (
          <SchoolCollectedFilesTable schoolCode={schoolCode} />
        )}
      </main>
    </div>
  );
}
