export type SortOrder = "asc" | "desc";

const STATUS_RANK: Record<string, number> = {
  running: 1,
  transferring: 2,
  collecting: 3,
  pending: 4,
  queued: 5,
  paused: 6,
  completed: 7,
  failed: 8,
  cancelled: 9,
};

function rankStatus(status: string): number {
  return STATUS_RANK[status] ?? 99;
}

function compareValues(
  left: string | number,
  right: string | number,
  sortOrder: SortOrder,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return sortOrder === "asc" ? left - right : right - left;
  }

  const result = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return sortOrder === "asc" ? result : -result;
}

export function sortRows<T>(
  rows: T[],
  sortOrder: SortOrder,
  getValue: (row: T) => string | number,
): T[] {
  return [...rows].sort((left, right) => compareValues(getValue(left), getValue(right), sortOrder));
}

export function sortRowsByStatus<T>(
  rows: T[],
  sortOrder: SortOrder,
  getStatus: (row: T) => string,
): T[] {
  return [...rows].sort((left, right) => {
    const leftRank = rankStatus(getStatus(left));
    const rightRank = rankStatus(getStatus(right));
    if (leftRank !== rightRank) {
      return sortOrder === "asc" ? leftRank - rightRank : rightRank - leftRank;
    }
    return compareValues(getStatus(left), getStatus(right), sortOrder);
  });
}
