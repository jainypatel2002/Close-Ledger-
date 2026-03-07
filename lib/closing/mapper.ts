import { ClosingFormValues } from "@/lib/validation/closing";
import { computeLotteryAmountDue } from "@/lib/math/lottery";

export const toClosingFormValues = ({
  closing,
  categories,
  lottery,
  billpay,
  paymentLines
}: {
  closing: Record<string, unknown>;
  categories: Record<string, unknown>[];
  lottery: Record<string, unknown>[];
  billpay: Record<string, unknown>[];
  paymentLines: Record<string, unknown>[];
}): ClosingFormValues => {
  const lotteryLines = lottery.map((line) => {
    const rawStart = Number(line.start_number ?? line.start_ticket_number ?? 0);
    const rawEnd = Number(line.end_number ?? line.end_ticket_number ?? 0);
    return {
      id: String(line.id),
      lottery_master_entry_id:
        line.lottery_master_entry_id === null || line.lottery_master_entry_id === undefined
          ? null
          : String(line.lottery_master_entry_id),
      display_number_snapshot: Number(
        line.display_number_snapshot ?? line.lottery_number_snapshot ?? 1
      ),
      lottery_name_snapshot: String(line.lottery_name_snapshot ?? line.game_name ?? "Lottery"),
      ticket_price_snapshot: Number(
        line.ticket_price_snapshot ?? line.amount_snapshot ?? line.ticket_price ?? 0
      ),
      bundle_size_snapshot: Number(line.bundle_size_snapshot ?? line.bundle_size ?? 100),
      is_locked_snapshot: Boolean(line.is_locked_snapshot),
      game_name: String(line.game_name ?? ""),
      pack_id: String(line.pack_id ?? ""),
      start_number: Math.max(rawStart, rawEnd),
      end_number: Math.min(rawStart, rawEnd),
      inclusive_count: false,
      bundle_size: Number(line.bundle_size_snapshot ?? line.bundle_size ?? 100),
      ticket_price: Number(
        line.ticket_price_snapshot ?? line.amount_snapshot ?? line.ticket_price ?? 0
      ),
      tickets_sold_override:
        line.tickets_sold_override === null || line.tickets_sold_override === undefined
          ? null
          : Number(line.tickets_sold_override),
      override_reason: String(line.override_reason ?? line.manual_override_reason ?? ""),
      manual_override_reason: String(line.manual_override_reason ?? line.override_reason ?? ""),
      payouts: Number(line.payouts ?? line.scratch_payouts ?? 0),
      scratch_payouts: Number(line.payouts ?? line.scratch_payouts ?? 0)
    };
  });

  const fallbackScratchRevenue = lottery.reduce(
    (sum, line) =>
      sum +
      Number(
        line.sales_amount ??
          line.scratch_sales ??
          Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0) *
            Math.max(
              0,
              Number(line.start_number ?? line.start_ticket_number ?? 0) -
                Number(line.end_number ?? line.end_ticket_number ?? 0)
            )
      ),
    0
  );
  const fallbackLegacyPaidOut = lottery.reduce(
    (sum, line) => sum + Number(line.payouts ?? line.scratch_payouts ?? 0),
    0
  );
  const fallbackOnline = Number(closing.draw_sales ?? 0);
  const fallbackPaidOut = fallbackLegacyPaidOut + Number(closing.draw_payouts ?? 0);

  const lotteryTotalScratchRevenue =
    closing.lottery_total_scratch_revenue === null ||
    closing.lottery_total_scratch_revenue === undefined
      ? fallbackScratchRevenue
      : Number(closing.lottery_total_scratch_revenue);
  const lotteryOnlineAmount =
    closing.lottery_online_amount === null || closing.lottery_online_amount === undefined
      ? fallbackOnline
      : Number(closing.lottery_online_amount);
  const lotteryPaidOutAmount =
    closing.lottery_paid_out_amount === null || closing.lottery_paid_out_amount === undefined
      ? fallbackPaidOut
      : Number(closing.lottery_paid_out_amount);
  const lotteryAmountDue =
    closing.lottery_amount_due === null || closing.lottery_amount_due === undefined
      ? computeLotteryAmountDue(lotteryTotalScratchRevenue, lotteryPaidOutAmount, lotteryOnlineAmount)
      : Number(closing.lottery_amount_due);

  const normalizedCategoryLines =
    categories.length > 0
      ? categories.map((line) => ({
          id: String(line.id),
          category_name: String(line.category_name ?? ""),
          amount: Number(line.amount ?? 0),
          taxable: Boolean(line.taxable)
        }))
      : [
          {
            id: crypto.randomUUID(),
            category_name: "Taxable Sales",
            amount: Number(closing.taxable_sales ?? 0),
            taxable: true
          },
          {
            id: crypto.randomUUID(),
            category_name: "Non-Taxable Sales",
            amount: Number(closing.non_taxable_sales ?? 0),
            taxable: false
          }
        ];

  const normalizedPaymentLines =
    paymentLines.length > 0
      ? paymentLines
          .map((line) => ({
            id: String(line.id),
            payment_type: String(line.payment_type ?? "other").toLowerCase(),
            label: String(line.label ?? "Payment"),
            amount: Number(line.amount ?? 0),
            sort_order: Number(line.sort_order ?? 0)
          }))
          .filter((line) =>
            line.payment_type === "cash" ||
            line.payment_type === "card" ||
            line.payment_type === "ebt" ||
            line.payment_type === "other"
          )
          .sort((a, b) => a.sort_order - b.sort_order)
      : [
          {
            id: crypto.randomUUID(),
            payment_type: "cash",
            label: "Cash",
            amount: Number(closing.cash_amount ?? 0),
            sort_order: 0
          },
          {
            id: crypto.randomUUID(),
            payment_type: "card",
            label: "Card",
            amount: Number(closing.card_amount ?? 0),
            sort_order: 1
          },
          {
            id: crypto.randomUUID(),
            payment_type: "ebt",
            label: "EBT",
            amount: Number(closing.ebt_amount ?? 0),
            sort_order: 2
          },
          {
            id: crypto.randomUUID(),
            payment_type: "other",
            label: "Other",
            amount: Number(closing.other_amount ?? 0),
            sort_order: 3
          }
        ];

  return {
    id: String(closing.id),
    store_id: String(closing.store_id),
    business_date: String(closing.business_date),
    status: closing.status as ClosingFormValues["status"],
    tax_mode: closing.tax_mode as ClosingFormValues["tax_mode"],
    tax_rate_used: Number(closing.tax_rate_used ?? 0),
    tax_override_enabled: Boolean(closing.tax_override_enabled),
    tax_amount_manual:
      closing.tax_amount_manual === null || closing.tax_amount_manual === undefined
        ? null
        : Number(closing.tax_amount_manual),
    lottery_total_scratch_revenue: lotteryTotalScratchRevenue,
    lottery_online_amount: lotteryOnlineAmount,
    lottery_paid_out_amount: lotteryPaidOutAmount,
    lottery_amount_due: lotteryAmountDue,
    draw_sales: Number(closing.draw_sales ?? 0),
    draw_payouts: Number(closing.draw_payouts ?? 0),
    cash_amount: Number(closing.cash_amount ?? 0),
    card_amount: Number(closing.card_amount ?? 0),
    ebt_amount: Number(closing.ebt_amount ?? 0),
    other_amount: Number(closing.other_amount ?? 0),
    notes: String(closing.notes ?? ""),
    include_billpay_in_gross: Boolean(closing.include_billpay_in_gross),
    include_lottery_in_gross: Boolean(closing.include_lottery_in_gross),
    category_lines: normalizedCategoryLines,
    lottery_lines: lotteryLines,
    billpay_lines: billpay.map((line) => ({
      id: String(line.id),
      provider_name: String(line.provider_name ?? ""),
      amount_collected: Number(line.amount_collected ?? 0),
      fee_revenue: Number(line.fee_revenue ?? 0),
      txn_count: Number(line.txn_count ?? 0)
    })),
    payment_lines: normalizedPaymentLines as ClosingFormValues["payment_lines"],
    reopen_reason: ""
  };
};
