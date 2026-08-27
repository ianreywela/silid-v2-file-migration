"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

type DashboardHeaderProps = {
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
};

export function DashboardHeader({
  title = "Silid V2 File Migration",
  subtitle = "AWS to Huawei OBS",
  backHref,
  backLabel = "Back to migrations",
}: DashboardHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="border-b border-white/15 bg-white/8 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-1 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {backLabel}
            </Link>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-foreground/80 sm:inline">
            {session?.user?.email}
          </span>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
