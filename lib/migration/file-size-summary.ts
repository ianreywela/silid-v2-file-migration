export type FilesSizeSummary = {
  transferred: { files: number; bytes: number };
  pending: { files: number; bytes: number };
  failed: { files: number; bytes: number };
  overall: { files: number; bytes: number };
};

export const EMPTY_FILES_SIZE_SUMMARY: FilesSizeSummary = {
  transferred: { files: 0, bytes: 0 },
  pending: { files: 0, bytes: 0 },
  failed: { files: 0, bytes: 0 },
  overall: { files: 0, bytes: 0 },
};
