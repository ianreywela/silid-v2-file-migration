import { NextRequest } from "next/server";
import { queryDistinctSchoolFiles } from "@/lib/migration/school-files-query";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";

type RouteContext = { params: Promise<{ schoolCode: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { schoolCode } = await context.params;
  const { searchParams } = request.nextUrl;

  if (!schoolCode?.trim()) {
    return Response.json({ success: false, message: "schoolCode is required" }, { status: 400 });
  }

  try {
    const data = await queryDistinctSchoolFiles({
      schoolCode: decodeURIComponent(schoolCode),
      filename: searchParams.get("filename")?.trim() || undefined,
      status: searchParams.get("status") ?? "all",
      category: searchParams.get("category") ?? "all",
      sortBy: searchParams.get("sortBy") ?? "filename",
      sortOrder: searchParams.get("sortOrder") === "desc" ? "desc" : "asc",
      page: Number(searchParams.get("page") ?? 1),
      limit: Number(searchParams.get("limit") ?? 25),
      resolveSize: searchParams.get("resolveSize") === "true",
    });

    return Response.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load school files";
    return Response.json({ success: false, message }, { status: 500 });
  }
}
