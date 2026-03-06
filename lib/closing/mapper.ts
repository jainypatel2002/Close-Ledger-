import { ClosingFormValues } from "@/lib/validation/closing";

export const toClosingFormValues = ({
  closing,
  categories,
  lottery,
  billpay
}: {
  closing: Record<string, unknown>;
  categories: Record<string, unknown>[];
  lottery: Record<string, unknown>[];
  billpay: Record<string, unknown>[];
}): ClosingFormValues => ({
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
  draw_sales: Number(closing.draw_sales ?? 0),
  draw_payouts: Number(closing.draw_payouts ?? 0),
  cash_amount: Number(closing.cash_amount ?? 0),
  card_amount: Number(closing.card_amount ?? 0),
  ebt_amount: Number(closing.ebt_amount ?? 0),
  other_amount: Number(closing.other_amount ?? 0),
  notes: String(closing.notes ?? ""),
  include_billpay_in_gross: Boolean(closing.include_billpay_in_gross),
  include_lottery_in_gross: Boolean(closing.include_lottery_in_gross),
  category_lines: categories.map((line) => ({
    id: String(line.id),
    category_name: String(line.category_name ?? ""),
    amount: Number(line.amount ?? 0),
    taxable: Boolean(line.taxable)
  })),
  lottery_lines: lottery.map((line) => ({
    id: String(line.id),
    lottery_master_entry_id:
      line.lottery_master_entry_id === null || line.lottery_master_entry_id === undefined
        ? null
        : String(line.lottery_master_entry_id),
    display_number_snapshot: Number(line.display_number_snapshot ?? 1),
    lottery_name_snapshot: String(line.lottery_name_snapshot ?? line.game_name ?? "Lottery"),
    ticket_price_snapshot: Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0),
    bundle_size_snapshot: Number(line.bundle_size_snapshot ?? line.bundle_size ?? 100),
    is_locked_snapshot: Boolean(line.is_locked_snapshot),
    game_name: String(line.game_name ?? ""),
    pack_id: String(line.pack_id ?? ""),
    start_number: Number(line.start_number ?? line.start_ticket_number ?? 0),
    end_number: Number(line.end_number ?? line.end_ticket_number ?? 0),
    inclusive_count: Boolean(line.inclusive_count),
    bundle_size: Number(line.bundle_size_snapshot ?? line.bundle_size ?? 100),
    ticket_price: Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0),
    tickets_sold_override:
      line.tickets_sold_override === null || line.tickets_sold_override === undefined
        ? null
        : Number(line.tickets_sold_override),
    override_reason: String(line.override_reason ?? line.manual_override_reason ?? ""),
    manual_override_reason: String(line.manual_override_reason ?? line.override_reason ?? ""),
    payouts: Number(line.payouts ?? line.scratch_payouts ?? 0),
    scratch_payouts: Number(line.payouts ?? line.scratch_payouts ?? 0)
  })),
  billpay_lines: billpay.map((line) => ({
    id: String(line.id),
    provider_name: String(line.provider_name ?? ""),
    amount_collected: Number(line.amount_collected ?? 0),
    fee_revenue: Number(line.fee_revenue ?? 0),
    txn_count: Number(line.txn_count ?? 0)
  })),
  reopen_reason: ""
});
