import { format } from "date-fns";
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
    lottery_total_scratch_revenue: 0,
    lottery_online_amount: 0,
    lottery_paid_out_amount: 0,
    lottery_amount_due: 0,
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
        category_name: "Taxable Sales",
        amount: 0,
        taxable: true
      },
      {
        id: crypto.randomUUID(),
        category_name: "Non-Taxable Sales",
        amount: 0,
        taxable: false
      }
    ],
    lottery_lines: snapshotLines.length > 0 ? snapshotLines : [],
    billpay_lines: [
      {
        id: crypto.randomUUID(),
        provider_name: "Default",
        amount_collected: 0,
        fee_revenue: 0,
        txn_count: 0
      }
    ],
    payment_lines: [
      {
        id: crypto.randomUUID(),
        payment_type: "cash",
        label: "Cash",
        amount: 0,
        sort_order: 0
      },
      {
        id: crypto.randomUUID(),
        payment_type: "card",
        label: "Card",
        amount: 0,
        sort_order: 1
      },
      {
        id: crypto.randomUUID(),
        payment_type: "ebt",
        label: "EBT",
        amount: 0,
        sort_order: 2
      },
      {
        id: crypto.randomUUID(),
        payment_type: "other",
        label: "Other",
        amount: 0,
        sort_order: 3
      }
    ],
    vendor_payout_lines: [],
    reopen_reason: ""
  };
};
