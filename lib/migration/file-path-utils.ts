export function getFileNameFromPath(filePath: string): string {
  const withoutQuery = filePath.split("?")[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

export function getCategoryFromPath(filePath: string): string {
  const withoutQuery = filePath.split("?")[0];
  const firstSegment = withoutQuery.split("/").filter(Boolean)[0];
  return firstSegment ?? "other";
}
