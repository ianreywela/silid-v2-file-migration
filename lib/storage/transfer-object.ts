import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getStorageProviders } from "@/lib/storage/providers";

export type TransferDirection = "aws-to-huawei" | "huawei-to-aws";

const TRANSFER_DIRECTIONS: Record<
  TransferDirection,
  { from: "AWS" | "HUAWEI"; to: "AWS" | "HUAWEI" }
> = {
  "aws-to-huawei": { from: "AWS", to: "HUAWEI" },
  "huawei-to-aws": { from: "HUAWEI", to: "AWS" },
};

export class TransferObjectError extends Error {
  code: "INVALID_DIRECTION" | "NOT_FOUND" | "TRANSFER_FAILED";

  constructor(
    message: string,
    code: "INVALID_DIRECTION" | "NOT_FOUND" | "TRANSFER_FAILED",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TransferObjectError";
    this.code = code;
  }
}

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

export async function transferObject(
  key: string,
  direction: TransferDirection = "aws-to-huawei",
) {
  const mapping = TRANSFER_DIRECTIONS[direction];
  if (!mapping) {
    throw new TransferObjectError(
      "direction must be aws-to-huawei or huawei-to-aws",
      "INVALID_DIRECTION",
    );
  }

  const providers = getStorageProviders();
  const source = providers[mapping.from];
  const destination = providers[mapping.to];

  if (!source.bucket || !destination.bucket) {
    throw new TransferObjectError(
      "Source or destination bucket is not configured",
      "TRANSFER_FAILED",
    );
  }

  let headSize = 0;
  try {
    const head = await source.client.send(
      new HeadObjectCommand({
        Bucket: source.bucket,
        Key: key,
      }),
    );
    headSize = head.ContentLength ?? 0;
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new TransferObjectError(
        `File not found in ${source.name} bucket`,
        "NOT_FOUND",
        { cause: error },
      );
    }
    throw new TransferObjectError(
      `Failed to read ${source.name} object metadata`,
      "TRANSFER_FAILED",
      { cause: error },
    );
  }

  let object;
  try {
    object = await source.client.send(
      new GetObjectCommand({
        Bucket: source.bucket,
        Key: key,
      }),
    );
  } catch (error) {
    throw new TransferObjectError(
      `Failed to download from ${source.name} bucket`,
      "TRANSFER_FAILED",
      { cause: error },
    );
  }

  if (!object.Body) {
    throw new TransferObjectError("Downloaded object has no body", "TRANSFER_FAILED");
  }

  try {
    await destination.client.send(
      new PutObjectCommand({
        Bucket: destination.bucket,
        Key: key,
        Body: object.Body,
        ContentType: object.ContentType,
        ContentLength: object.ContentLength,
      }),
    );
  } catch (error) {
    throw new TransferObjectError(
      `Failed to upload to ${destination.name} bucket`,
      "TRANSFER_FAILED",
      { cause: error },
    );
  }

  return {
    folderPath: key,
    from: source.name,
    to: destination.name,
    size: object.ContentLength ?? headSize,
  };
}
