import { formatBytes } from "@/lib/utils/format-bytes";
import type { FilesSizeSummary } from "@/lib/migration/file-size-summary";

type FilesSizeSummaryBarProps = {
  summary: FilesSizeSummary;
};

export function FilesSizeSummaryBar({ summary }: FilesSizeSummaryBarProps) {
  const items = [
    {
      label: "Total transferred",
      files: summary.transferred.files,
      bytes: summary.transferred.bytes,
      accent: "text-emerald-300",
    },
    {
      label: "Total pending",
      files: summary.pending.files,
      bytes: summary.pending.bytes,
      accent: "text-amber-300",
    },
    {
      label: "Total failed",
      files: summary.failed.files,
      bytes: summary.failed.bytes,
      accent: "text-red-300",
    },
    {
      label: "Overall",
      files: summary.overall.files,
      bytes: summary.overall.bytes,
      accent: "text-foreground",
    },
  ];

  return (
    <div className="grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass-stat">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className={`mt-1 text-lg font-semibold ${item.accent}`}>
            {item.files.toLocaleString()} file{item.files === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatBytes(item.bytes)}</p>
        </div>
      ))}
    </div>
  );
}
