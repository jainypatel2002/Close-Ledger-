import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { getMonthlyAnalytics } from "@/lib/analytics/monthly";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const storeId = request.nextUrl.searchParams.get("storeId");
    const month = Number(request.nextUrl.searchParams.get("month") ?? new Date().getMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const rangeMonths = Number(request.nextUrl.searchParams.get("rangeMonths") ?? 1);
    const compareToPreviousMonth = request.nextUrl.searchParams.get("compare") === "1";

    if (!storeId) {
      return NextResponse.json({ error: "Missing storeId." }, { status: 400 });
    }

    const membership = await getMembershipForStore(storeId);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Monthly analytics are admin-only for this store." },
        { status: 403 }
      );
    }

    const data = await getMonthlyAnalytics({
      storeId,
      month,
      year,
      rangeMonths,
      compareToPreviousMonth
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load monthly analytics." },
      { status: 400 }
    );
  }
}
