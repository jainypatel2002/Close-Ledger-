"use client";

import { useEffect } from "react";
import { offlineDb } from "@/lib/offline/db";
import { LotteryMasterEntry, Store } from "@/lib/types";

interface OfflineHydratorProps {
  stores?: Store[];
  closings?: Array<Record<string, unknown>>;
  lotteryMasterEntries?: LotteryMasterEntry[];
}

export const OfflineHydrator = ({
  stores = [],
  closings = [],
  lotteryMasterEntries = []
}: OfflineHydratorProps) => {
  useEffect(() => {
    void (async () => {
      const now = new Date().toISOString();
      for (const store of stores) {
        await offlineDb.stores.put({
          ...store,
          _dirty: false
        });
      }
      for (const closing of closings) {
        const id = String(closing.id ?? "");
        if (!id) {
          continue;
        }
        const existing = await offlineDb.closings.get(id);
        if (existing?._dirty) {
          continue;
        }
        await offlineDb.closings.put({
          id,
          store_id: String(closing.store_id ?? ""),
          business_date: String(closing.business_date ?? now.slice(0, 10)),
          status: (closing.status as "DRAFT" | "SUBMITTED" | "FINALIZED" | "LOCKED") ?? "DRAFT",
          tax_mode: (closing.tax_mode as "AUTO" | "MANUAL") ?? "AUTO",
          tax_rate_used: Number(closing.tax_rate_used ?? 0),
          tax_override_enabled: Boolean(closing.tax_override_enabled),
          tax_amount_manual:
            closing.tax_amount_manual === null || closing.tax_amount_manual === undefined
              ? null
              : Number(closing.tax_amount_manual),
          lottery_total_scratch_revenue: Number(
            closing.lottery_total_scratch_revenue ?? closing.lottery_total_sales ?? 0
          ),
          lottery_online_amount: Number(closing.lottery_online_amount ?? closing.draw_sales ?? 0),
          lottery_paid_out_amount: Number(
            closing.lottery_paid_out_amount ?? closing.lottery_total_payouts ?? 0
          ),
          lottery_amount_due: Number(closing.lottery_amount_due ?? closing.lottery_net ?? 0),
          draw_sales: Number(closing.draw_sales ?? 0),
          draw_payouts: Number(closing.draw_payouts ?? 0),
          cash_amount: Number(closing.cash_amount ?? 0),
          card_amount: Number(closing.card_amount ?? 0),
          ebt_amount: Number(closing.ebt_amount ?? 0),
          other_amount: Number(closing.other_amount ?? 0),
          notes: String(closing.notes ?? ""),
          include_billpay_in_gross: Boolean(closing.include_billpay_in_gross),
          include_lottery_in_gross: Boolean(closing.include_lottery_in_gross),
          category_lines: existing?.category_lines ?? [],
          lottery_lines: existing?.lottery_lines ?? [],
          billpay_lines: existing?.billpay_lines ?? [],
          reopen_reason: "",
          updated_at: String(closing.updated_at ?? now),
          _dirty: false
        });
      }

      for (const entry of lotteryMasterEntries) {
        const existing = await offlineDb.lotteryMasterEntries.get(entry.id);
        if (existing?._dirty) {
          continue;
        }
        await offlineDb.lotteryMasterEntries.put({
          ...entry,
          _dirty: false
        });
      }
    })();
  }, [closings, stores, lotteryMasterEntries]);

  return null;
};
