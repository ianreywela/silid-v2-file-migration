type TableSortButtonProps = {
  label: string;
  active: boolean;
  sortOrder: "asc" | "desc";
  onClick: () => void;
};

export function TableSortButton({
  label,
  active,
  sortOrder,
  onClick,
}: TableSortButtonProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium text-foreground/90 hover:text-foreground"
      onClick={onClick}
    >
      {label}
      <span className="text-xs text-muted-foreground">
        {active ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}
