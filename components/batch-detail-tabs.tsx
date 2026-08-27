import { cn } from "@/lib/utils";

export type BatchDetailTab = "analytics" | "active-batch";

const TABS: { id: BatchDetailTab; label: string }[] = [
  { id: "analytics", label: "Transfer Analytics" },
  { id: "active-batch", label: "Active Batch" },
];

type BatchDetailTabsProps = {
  value: BatchDetailTab;
  onChange: (value: BatchDetailTab) => void;
};

export function BatchDetailTabs({ value, onChange }: BatchDetailTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Batch details"
      className="flex gap-1 rounded-xl border border-white/15 bg-white/6 p-1 backdrop-blur-md"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            value === tab.id
              ? "bg-white/14 text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-white/8 hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
