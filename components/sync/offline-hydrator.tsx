"use client";

import { useEffect } from "react";
import { offlineDb } from "@/lib/offline/db";
import { LotteryMasterEntry, Store } from "@/lib/types";

interface OfflineHydratorProps {
  stores?: Store[];
  closings?: Array<Record<string, unknown>>;
  lotteryMasterEntries?: LotteryMasterEntry[];
}

const buildFallbackPaymentLines = (closing: Record<string, unknown>) => [
  {
    id: crypto.randomUUID(),
    payment_type: "cash" as const,
    label: "Cash",
    amount: Number(closing.cash_amount ?? 0),
    sort_order: 0
  },
  {
    id: crypto.randomUUID(),
    payment_type: "card" as const,
    label: "Card",
    amount: Number(closing.card_amount ?? 0),
    sort_order: 1
  },
  {
    id: crypto.randomUUID(),
    payment_type: "ebt" as const,
    label: "EBT",
    amount: Number(closing.ebt_amount ?? 0),
    sort_order: 2
  },
  {
    id: crypto.randomUUID(),
    payment_type: "other" as const,
    label: "Other",
    amount: Number(closing.other_amount ?? 0),
    sort_order: 3
  }
];

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
          payment_lines: existing?.payment_lines ?? buildFallbackPaymentLines(closing),
          vendor_payout_lines: existing?.vendor_payout_lines ?? [],
          reopen_reason: "",
          updated_at: String(closing.updated_at ?? now),
          _dirty: false
        });
      }

      const storesWithLotteryPayload = new Set<string>(stores.map((store) => store.id));
      lotteryMasterEntries.forEach((entry) => {
        storesWithLotteryPayload.add(entry.store_id);
      });

      for (const scopedStoreId of storesWithLotteryPayload) {
        const serverIds = new Set(
          lotteryMasterEntries
            .filter((entry) => entry.store_id === scopedStoreId)
            .map((entry) => entry.id)
        );
        const cachedEntries = await offlineDb.lotteryMasterEntries
          .where("store_id")
          .equals(scopedStoreId)
          .toArray();
        for (const cached of cachedEntries) {
          if (cached._dirty) {
            continue;
          }
          if (!serverIds.has(cached.id)) {
            await offlineDb.lotteryMasterEntries.delete(cached.id);
          }
        }
      }

      for (const entry of lotteryMasterEntries) {
        const existing = await offlineDb.lotteryMasterEntries.get(entry.id);
        if (existing?._dirty) {
          continue;
        }
        await offlineDb.lotteryMasterEntries.put({
          ...entry,
          is_archived: Boolean(entry.is_archived),
          archived_at: entry.archived_at ?? null,
          archived_by_app_user_id: entry.archived_by_app_user_id ?? null,
          _dirty: false
        });
      }
    })();
  }, [closings, stores, lotteryMasterEntries]);

  return null;
};
