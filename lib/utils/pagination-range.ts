type FormatPaginationRangeOptions = {
  page: number;
  limit: number;
  total: number;
  label?: string;
};

export function formatPaginationRange({
  page,
  limit,
  total,
  label = "files",
}: FormatPaginationRangeOptions): string {
  if (total === 0) {
    return `No ${label}`;
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (start === end) {
    return `Showing ${start.toLocaleString()} of ${total.toLocaleString()} ${label}`;
  }

  return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} ${label}`;
}
