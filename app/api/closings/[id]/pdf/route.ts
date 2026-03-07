import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { generateClosingPdf } from "@/lib/pdf/closing-pdf";

const toPathDate = (businessDate: string) => {
  const [year, month, day] = businessDate.split("-");
  return { year, month, day };
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      chartData?: {
        gross?: Array<{ name: string; value: number }>;
        payments?: Array<{ name: string; value: number }>;
      };
    };

    const supabase = await createSupabaseServerClient();
    const { data: closing, error: closingError } = await supabase
      .from("closing_days")
      .select("*")
      .eq("id", id)
      .single();
    if (closingError || !closing) {
      return NextResponse.json({ error: "Closing not found." }, { status: 404 });
    }

    const membership = await getMembershipForStore(closing.store_id);
    if (!membership) {
      return NextResponse.json({ error: "No store access." }, { status: 403 });
    }

    const [{ data: store }, { data: lottery }, { data: billpay }, { data: paymentLines }, { data: existingDocs }] =
      await Promise.all([
      supabase.from("stores").select("*").eq("id", closing.store_id).single(),
      supabase
        .from("lottery_scratch_lines")
        .select("*")
        .eq("closing_day_id", id)
        .order("display_number_snapshot", { ascending: true }),
      supabase.from("billpay_lines").select("*").eq("closing_day_id", id),
      supabase
        .from("payment_lines")
        .select("*")
        .eq("closing_day_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("closing_documents").select("id").eq("closing_day_id", id).limit(1)
    ]);

    if (!store) {
      return NextResponse.json({ error: "Store not found." }, { status: 404 });
    }
    if (membership.role === "STAFF") {
      const canPrint =
        Boolean(membership.permissions.can_print_pdf) || Boolean(store.allow_staff_print_pdf);
      if (!canPrint || closing.created_by !== user.id) {
        return NextResponse.json(
          { error: "Staff cannot print this PDF for this entry." },
          { status: 403 }
        );
      }
      if ((existingDocs ?? []).length > 0) {
        return NextResponse.json(
          { error: "Staff cannot regenerate historical PDFs." },
          { status: 403 }
        );
      }
    }

    const bytes = await generateClosingPdf({
      store,
      closing,
      lotteryLines: lottery ?? [],
      billpayLines: billpay ?? [],
      paymentLines: paymentLines ?? [],
      chartData: {
        gross:
          body.chartData?.gross?.map((slice) => ({ ...slice })) ?? [
            { name: "Products", value: closing.total_sales_gross ?? 0 },
            { name: "Lottery", value: closing.lottery_total_sales ?? 0 },
            { name: "Billpay", value: closing.billpay_collected_total ?? 0 }
          ],
        payments:
          body.chartData?.payments?.map((slice) => ({ ...slice })) ??
          (() => {
            const totals = new Map<string, number>([
              ["cash", 0],
              ["card", 0],
              ["ebt", 0],
              ["other", 0]
            ]);
            (paymentLines ?? []).forEach((line) => {
              const type = String(line.payment_type ?? "").toLowerCase();
              if (!totals.has(type)) {
                return;
              }
              totals.set(type, Number(totals.get(type) ?? 0) + Number(line.amount ?? 0));
            });
            if ((paymentLines ?? []).length === 0) {
              totals.set("cash", Number(closing.cash_amount ?? 0));
              totals.set("card", Number(closing.card_amount ?? 0));
              totals.set("ebt", Number(closing.ebt_amount ?? 0));
              totals.set("other", Number(closing.other_amount ?? 0));
            }
            return [
              { name: "Cash", value: Number(totals.get("cash") ?? 0) },
              { name: "Card", value: Number(totals.get("card") ?? 0) },
              { name: "EBT", value: Number(totals.get("ebt") ?? 0) },
              { name: "Other", value: Number(totals.get("other") ?? 0) }
            ];
          })()
      }
    });

    const { year, month, day } = toPathDate(closing.business_date);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `closing_${closing.business_date}_${timestamp}.pdf`;
    const bucketPath = `${user.id}/${closing.store_id}/${year}/${month}/${day}/${fileName}`;

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
      closing_day_id: closing.id,
      store_id: closing.store_id,
      created_by: user.id,
      file_name: fileName,
      bucket_path: bucketPath,
      public_url: signedData?.signedUrl ?? null,
      document_type: "closing_pdf",
      report_year: null,
      report_month: null,
      source: "SERVER"
    });

    if (docError) {
      throw docError;
    }

    return NextResponse.json({ url: signedData?.signedUrl ?? null, bucketPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF." },
      { status: 400 }
    );
  }
}
