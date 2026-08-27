import { NextRequest } from "next/server";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth/verify";
import { getSchoolsByDateRange } from "@/lib/firebase/schools";

export async function GET(request: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return Response.json(
      { success: false, error: "startDate and endDate are required" },
      { status: 400 },
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Response.json(
      { success: false, error: "Invalid startDate or endDate" },
      { status: 400 },
    );
  }

  try {
    const data = await getSchoolsByDateRange(start, end);
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch schools",
      },
      { status: 500 },
    );
  }
}
