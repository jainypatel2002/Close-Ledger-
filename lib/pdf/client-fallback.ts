"use client";

import { Store } from "@/lib/types";
import { ClosingFormValues } from "@/lib/validation/closing";
import { computeClosingTotals } from "@/lib/math/closing";
import { generateClosingPdf } from "@/lib/pdf/closing-pdf";

export const generateOfflineClosingPdf = async ({
  store,
  closing,
  generatedAtIso
}: {
  store: Store;
  closing: ClosingFormValues;
  generatedAtIso?: string;
}) => {
  const totals = computeClosingTotals({
    categoryLines: (closing.category_lines ?? []).map((line) => ({
      amount: Number(line.amount ?? 0),
      taxable: Boolean(line.taxable)
    })),
    lotteryScratchLines: (closing.lottery_lines ?? []).map((line) => ({
      start_number: Number(line.start_number ?? line.start_ticket_number ?? 0),
      end_number: Number(line.end_number ?? line.end_ticket_number ?? 0),
      inclusive_count: Boolean(line.inclusive_count),
      ticket_price_snapshot: Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0),
      tickets_sold_override: line.tickets_sold_override ?? null,
      bundle_size_snapshot: Number(line.bundle_size_snapshot ?? line.bundle_size ?? store.scratch_bundle_size_default),
      payouts: Number(line.payouts ?? line.scratch_payouts ?? 0),
      scratch_payouts: Number(line.scratch_payouts ?? line.payouts ?? 0)
    })),
    lottery_online_amount: Number(closing.lottery_online_amount ?? 0),
    lottery_paid_out_amount: Number(closing.lottery_paid_out_amount ?? 0),
    draw_sales: Number(closing.draw_sales ?? 0),
    draw_payouts: Number(closing.draw_payouts ?? 0),
    billpayLines: (closing.billpay_lines ?? []).map((line) => ({
      amount_collected: Number(line.amount_collected ?? 0),
      fee_revenue: Number(line.fee_revenue ?? 0),
      txn_count: Number(line.txn_count ?? 0)
    })),
    tax_mode: closing.tax_mode,
    tax_rate: Number(closing.tax_rate_used ?? 0),
    tax_amount_manual: closing.tax_override_enabled ? Number(closing.tax_amount_manual ?? 0) : null,
    includeBillpayInGross: Boolean(closing.include_billpay_in_gross),
    includeLotteryInGross: Boolean(closing.include_lottery_in_gross),
    paymentLines: (closing.payment_lines ?? []).map((line) => ({
      payment_type: line.payment_type,
      amount: Number(line.amount ?? 0)
    })),
    paymentBreakdown: {
      cash_amount: Number(closing.cash_amount ?? 0),
      card_amount: Number(closing.card_amount ?? 0),
      ebt_amount: Number(closing.ebt_amount ?? 0),
      other_amount: Number(closing.other_amount ?? 0)
    }
  });

  return generateClosingPdf({
    store,
    closing: {
      id: closing.id,
      store_id: closing.store_id,
      business_date: closing.business_date,
      status: closing.status,
      gross_collected: totals.gross_collected,
      true_revenue: totals.true_revenue,
      total_sales_gross: totals.total_sales_gross,
      taxable_sales: totals.taxable_sales,
      non_taxable_sales: totals.non_taxable_sales,
      tax_rate_used: closing.tax_rate_used,
      tax_amount: totals.tax_amount,
      draw_sales: closing.draw_sales,
      draw_payouts: closing.draw_payouts,
      lottery_total_scratch_revenue: totals.lottery_total_scratch_revenue,
      lottery_online_amount: totals.lottery_online_amount,
      lottery_paid_out_amount: totals.lottery_paid_out_amount,
      lottery_amount_due: totals.lottery_amount_due,
      lottery_total_sales: totals.lottery_total_sales,
      lottery_total_payouts: totals.lottery_total_payouts,
      lottery_net: totals.lottery_net,
      billpay_collected_total: totals.billpay_collected_total,
      billpay_fee_revenue: totals.billpay_fee_revenue,
      billpay_transactions_count: totals.billpay_transactions_count,
      cash_amount: totals.cash_amount,
      card_amount: totals.card_amount,
      ebt_amount: totals.ebt_amount,
      other_amount: totals.other_amount,
      payments_total: totals.payments_total,
      notes: closing.notes ?? null,
      created_at: new Date().toISOString()
    },
    lotteryLines: closing.lottery_lines,
    billpayLines: closing.billpay_lines,
    paymentLines: closing.payment_lines,
    generatedAtIso,
    sourceLabel: "OFFLINE PDF"
  });
};

export const downloadPdfBytes = (bytes: Uint8Array, fileName: string) => {
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
