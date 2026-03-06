import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { getMonthlyAnalytics } from "@/lib/analytics/monthly";

const csvEscape = (value: string | number | null | undefined) => {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
};

const toCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>) =>
  [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const storeId = request.nextUrl.searchParams.get("storeId");
    const month = Number(request.nextUrl.searchParams.get("month") ?? new Date().getMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const type = request.nextUrl.searchParams.get("type") ?? "daily";

    if (!storeId) {
      return NextResponse.json({ error: "Missing storeId." }, { status: 400 });
    }

    const membership = await getMembershipForStore(storeId);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Monthly exports are admin-only for this store." },
        { status: 403 }
      );
    }

    const monthly = await getMonthlyAnalytics({
      storeId,
      month,
      year,
      rangeMonths: 1,
      compareToPreviousMonth: false
    });

    let csv = "";
    let filename = "";

    if (type === "lottery") {
      const headers = [
        "display_number",
        "lottery_name",
        "total_ticket_lines_count",
        "total_tickets_sold",
        "avg_ticket_price",
        "total_scratch_revenue"
      ];
      const rows = monthly.lottery.table.map((row) => [
        row.display_number,
        row.lottery_name,
        row.total_ticket_lines_count,
        row.total_tickets_sold,
        row.avg_ticket_price,
        row.total_scratch_sales
      ]);
      csv = toCsv(headers, rows);
      filename = `lottery_breakdown_${storeId}_${year}-${String(month).padStart(2, "0")}.csv`;
    } else if (type === "payment") {
      const headers = ["payment_method", "amount", "percent"];
      const rows = monthly.payments.rows.map((row) => [row.name, row.amount, row.percent]);
      csv = toCsv(headers, rows);
      filename = `payment_breakdown_${storeId}_${year}-${String(month).padStart(2, "0")}.csv`;
    } else if (type === "billpay") {
      const headers = ["provider", "total_collected", "total_fee_revenue", "transaction_count"];
      const rows = monthly.billpay.provider_breakdown.map((row) => [
        row.provider,
        row.total_collected,
        row.total_fee_revenue,
        row.transaction_count
      ]);
      csv = toCsv(headers, rows);
      filename = `billpay_breakdown_${storeId}_${year}-${String(month).padStart(2, "0")}.csv`;
    } else {
      const headers = [
        "date",
        "status",
        "gross_collected",
        "true_revenue",
        "scratch_revenue",
        "online_amount",
        "paid_out_amount",
        "amount_due",
        "billpay_collected",
        "taxable_sales",
        "non_taxable_sales",
        "tax_amount",
        "cash",
        "card",
        "tickets_sold_total"
      ];
      const rows = monthly.daily_performance.map((row) => [
        row.date,
        row.status,
        row.gross_collected,
        row.true_revenue,
        row.scratch_revenue,
        row.online_amount,
        row.paid_out_amount,
        row.amount_due,
        row.billpay_collected,
        row.taxable_sales,
        row.non_taxable_sales,
        row.tax_amount,
        row.cash,
        row.card,
        row.tickets_sold_total
      ]);
      csv = toCsv(headers, rows);
      filename = `daily_closings_${storeId}_${year}-${String(month).padStart(2, "0")}.csv`;
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=\"${filename}\"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV export failed." },
      { status: 400 }
    );
  }
}
