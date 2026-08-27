import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

export type StorageProvider = {
  name: "AWS" | "HUAWEI";
  bucket: string;
  client: S3Client;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} env var is required`);
  }
  return value;
}

/**
 * Mirrors silid-file-uploader/core/providers.js
 * @see /home/ianrey258/Documents/wela-workspace/node-projects/silid-file-uploader/core/providers.js
 */
function createProviders(): { AWS: StorageProvider; HUAWEI: StorageProvider } {
  const awsBucket = requireEnv("AWS_BUCKET");
  const huaweiBucket = requireEnv("HUAWEI_AWS_BUCKET");

  const awsClientConfig: S3ClientConfig = {
    region: env("AWS_REGION") ?? "ap-southeast-1",
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_KEY_ID"),
    },
  };

  // Huawei OBS requires virtual-hosted URLs:
  // https://bucket.obs.region.myhuaweicloud.com/...
  // Path-style (obs.region/.../bucket/...) returns VirtualHostDomainRequired.
  const huaweiClientConfig: S3ClientConfig = {
    region: requireEnv("HUAWEI_AWS_REGION"),
    endpoint: requireEnv("HUAWEI_AWS_ENDPOINT"),
    forcePathStyle: false,
    // Newer @aws-sdk/client-s3 enables checksums by default; Huawei OBS may reject them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: requireEnv("HUAWEI_AWS_ACCESS_ID"),
      secretAccessKey: requireEnv("HUAWEI_AWS_SECRET_KEY_ID"),
    },
  };

  return {
    AWS: {
      name: "AWS",
      bucket: awsBucket,
      client: new S3Client(awsClientConfig),
    },
    HUAWEI: {
      name: "HUAWEI",
      bucket: huaweiBucket,
      client: new S3Client(huaweiClientConfig),
    },
  };
}

let cachedProviders: ReturnType<typeof createProviders> | null = null;

export function getStorageProviders() {
  if (!cachedProviders) {
    cachedProviders = createProviders();
  }
  return cachedProviders;
}

// silid-file-uploader reads Huawei first, then AWS (not used for aws-to-huawei migration).
export const readProviderOrder = () => {
  const providers = getStorageProviders();
  return [providers.HUAWEI, providers.AWS] as const;
};
