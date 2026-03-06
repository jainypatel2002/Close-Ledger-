import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { getMonthlyAnalytics } from "@/lib/analytics/monthly";
import { generateMonthlyReportPdf } from "@/lib/pdf/monthly-report-pdf";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      storeId?: string;
      month?: number;
      year?: number;
      note?: string;
    };

    const storeId = String(body.storeId ?? "");
    const month = Number(body.month ?? new Date().getMonth() + 1);
    const year = Number(body.year ?? new Date().getFullYear());
    const note = String(body.note ?? "");

    if (!storeId) {
      return NextResponse.json({ error: "Missing storeId." }, { status: 400 });
    }

    const membership = await getMembershipForStore(storeId);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Monthly PDF export is admin-only for this store." },
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

    const supabase = await createSupabaseServerClient();
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("store_name,legal_name,address_line1,address_line2,city,state,zip,phone,email,header_text")
      .eq("id", storeId)
      .single();
    if (storeError || !store) {
      return NextResponse.json({ error: "Store not found." }, { status: 404 });
    }

    const bytes = await generateMonthlyReportPdf({
      store,
      monthLabel: monthly.month_label,
      generatedAtIso: new Date().toISOString(),
      note,
      summaryRows: [
        ["Gross Collected", monthly.metrics.total_gross_collected_month],
        ["True Revenue", monthly.metrics.total_true_revenue_month],
        ["Taxable Sales", monthly.metrics.total_taxable_sales_month],
        ["Non-Taxable Sales", monthly.metrics.total_non_taxable_sales_month],
        ["Tax Collected", monthly.metrics.total_tax_collected_month],
        ["Cash", monthly.metrics.total_cash_month],
        ["Card", monthly.metrics.total_card_month],
        ["EBT", monthly.metrics.total_ebt_month],
        ["Other", monthly.metrics.total_other_payments_month],
        ["Scratch Revenue", monthly.metrics.total_lottery_scratch_revenue_month],
        ["Lottery Online", monthly.metrics.total_lottery_online_amount_month],
        ["Lottery Paid Out", monthly.metrics.total_lottery_paid_out_month],
        ["Lottery Amount Due", monthly.metrics.total_lottery_amount_due_month],
        ["Lottery Sales", monthly.metrics.total_lottery_sales_month],
        ["Billpay Collected", monthly.metrics.total_billpay_collected_month],
        ["Billpay Fee Revenue", monthly.metrics.total_billpay_fee_revenue_month],
        ["Scratch Tickets Sold", monthly.metrics.total_scratch_tickets_sold_month]
      ],
      paymentRows: monthly.payments.rows.map((row) => ({
        name: row.name,
        amount: row.amount,
        percent: row.percent
      })),
      taxRows: [
        ["Total Taxable Sales", monthly.tax.total_taxable_sales],
        ["Total Non-Taxable Sales", monthly.tax.total_non_taxable_sales],
        ["Total Tax Collected", monthly.tax.total_tax_collected],
        ["Avg Daily Taxable Sales", monthly.tax.avg_daily_taxable_sales],
        ["Avg Daily Tax Collected", monthly.tax.avg_daily_tax_collected]
      ],
      lotteryRows: monthly.lottery.table,
      dailyRows: monthly.daily_performance,
      charts: {
        revenueCategories: monthly.charts.revenue_categories,
        paymentMethods: monthly.charts.payment_methods,
        topLotteryTickets: monthly.charts.top_lottery_tickets.map((row) => ({
          name: row.name,
          value: row.value
        }))
      }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `monthly_report_${year}-${String(month).padStart(2, "0")}_${timestamp}.pdf`;
    const bucketPath = `${user.id}/${storeId}/reports/${year}/${String(month).padStart(2, "0")}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("closing-pdfs")
      .upload(bucketPath, bytes, {
        contentType: "application/pdf",
        upsert: true
      });
    if (uploadError) {
      throw uploadError;
    }

    const { data: signedData } = await supabase.storage
      .from("closing-pdfs")
      .createSignedUrl(bucketPath, 60 * 60 * 24 * 7);

    const { error: docError } = await supabase.from("closing_documents").insert({
      closing_day_id: null,
      store_id: storeId,
      created_by: user.id,
      file_name: fileName,
      bucket_path: bucketPath,
      public_url: signedData?.signedUrl ?? null,
      document_type: "monthly_report_pdf",
      report_year: year,
      report_month: month,
      source: "SERVER"
    });
    if (docError) {
      throw docError;
    }

    return NextResponse.json({ url: signedData?.signedUrl ?? null, bucketPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate monthly PDF." },
      { status: 400 }
    );
  }
}
