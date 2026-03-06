import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "Missing storeId." }, { status: 400 });
    }
    const membership = await getMembershipForStore(storeId);
    if (!membership) {
      return NextResponse.json({ error: "No store access." }, { status: 403 });
    }
    const supabase = await createSupabaseServerClient();
    if (membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Export not allowed." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("closing_days")
      .select("business_date,status,gross_collected,true_revenue,tax_amount,cash_amount,card_amount,ebt_amount,other_amount")
      .eq("store_id", storeId)
      .order("business_date", { ascending: false })
      .limit(1000);
    if (error) {
      throw error;
    }

    const headers = [
      "business_date",
      "status",
      "gross_collected",
      "true_revenue",
      "tax_amount",
      "cash_amount",
      "card_amount",
      "ebt_amount",
      "other_amount"
    ];
    const rows = (data ?? []).map((row) =>
      headers.map((key) => String((row as Record<string, unknown>)[key] ?? "")).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="closing_export_${storeId}.csv"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 400 }
    );
  }
}
