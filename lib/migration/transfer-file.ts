import {
  TransferObjectError,
  transferObject,
} from "@/lib/storage/transfer-object";

export type TransferResult = {
  ok: boolean;
  statusCode: number;
  body: Record<string, unknown>;
};

export async function transferFile(folderPath: string): Promise<TransferResult> {
  try {
    const result = await transferObject(folderPath, "aws-to-huawei");

    return {
      ok: true,
      statusCode: 200,
      body: {
        success: true,
        folderPath: result.folderPath,
        from: result.from,
        to: result.to,
        size: result.size,
      },
    };
  } catch (error) {
    if (error instanceof TransferObjectError) {
      if (error.code === "NOT_FOUND") {
        return {
          ok: false,
          statusCode: 404,
          body: { success: false, message: error.message },
        };
      }

      if (error.code === "INVALID_DIRECTION") {
        return {
          ok: false,
          statusCode: 400,
          body: { success: false, message: error.message },
        };
      }

      return {
        ok: false,
        statusCode: 500,
        body: { success: false, message: error.message },
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      statusCode: 500,
      body: { success: false, message },
    };
  }
}
