import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getStorageProviders } from "@/lib/storage/providers";

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String(error.name) : "";
  const status =
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

export async function getObjectSizeBytes(filePath: string): Promise<number | null> {
  const { AWS } = getStorageProviders();

  try {
    const head = await AWS.client.send(
      new HeadObjectCommand({
        Bucket: AWS.bucket,
        Key: filePath,
      }),
    );
    return head.ContentLength ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}
