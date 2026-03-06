import { format } from "date-fns";
import { DEFAULT_SCRATCH_BUNDLE_SIZE } from "@/lib/constants";
import { LotteryMasterEntry, Store } from "@/lib/types";
import { buildLotteryLinesFromMasterEntries } from "@/lib/lottery/snapshots";
import { ClosingFormValues } from "@/lib/validation/closing";

export const createEmptyClosing = (
  store: Store,
  lotteryMasterEntries: LotteryMasterEntry[] = []
): ClosingFormValues => {
  const snapshotLines = buildLotteryLinesFromMasterEntries(lotteryMasterEntries);

  return {
    id: crypto.randomUUID(),
    store_id: store.id,
    business_date: format(new Date(), "yyyy-MM-dd"),
    status: "DRAFT",
    tax_mode: "AUTO",
    tax_rate_used: store.tax_rate_default,
    tax_override_enabled: false,
    tax_amount_manual: null,
    draw_sales: 0,
    draw_payouts: 0,
    cash_amount: 0,
    card_amount: 0,
    ebt_amount: 0,
    other_amount: 0,
    notes: "",
    include_billpay_in_gross: store.include_billpay_in_gross,
    include_lottery_in_gross: store.include_lottery_in_gross,
    category_lines: [
      {
        id: crypto.randomUUID(),
        category_name: "General Merchandise",
        amount: 0,
        taxable: true
      }
    ],
    lottery_lines:
      snapshotLines.length > 0
        ? snapshotLines
        : [
            {
              id: crypto.randomUUID(),
              lottery_master_entry_id: null,
              display_number_snapshot: 1,
              lottery_name_snapshot: "Lottery",
              ticket_price_snapshot: 0,
              bundle_size_snapshot:
                store.scratch_bundle_size_default ?? DEFAULT_SCRATCH_BUNDLE_SIZE,
              is_locked_snapshot: false,
              pack_id: "",
              start_number: 0,
              end_number: 0,
              inclusive_count: false,
              tickets_sold_override: null,
              manual_override_reason: "",
              override_reason: "",
              payouts: 0
            }
          ],
    billpay_lines: [
      {
        id: crypto.randomUUID(),
        provider_name: "Default",
        amount_collected: 0,
        fee_revenue: 0,
        txn_count: 0
      }
    ],
    reopen_reason: ""
  };
};
