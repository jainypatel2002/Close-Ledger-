import { LotteryMasterEntry } from "@/lib/types";
import {
  computeLotteryNet,
  computeScratchRevenue,
  computeTicketsSold
} from "@/lib/math/lottery";

export interface LotteryClosingLineSnapshot {
  id: string;
  lottery_master_entry_id?: string | null;
  display_number_snapshot: number;
  lottery_name_snapshot: string;
  ticket_price_snapshot: number;
  bundle_size_snapshot: number;
  is_locked_snapshot: boolean;
  pack_id?: string;
  start_number: number;
  end_number: number;
  inclusive_count: boolean;
  tickets_sold_override?: number | null;
  manual_override_reason?: string;
  override_reason?: string | null;
  payouts: number;
}

export const buildLotteryLineFromMasterEntry = (
  entry: LotteryMasterEntry
): LotteryClosingLineSnapshot => ({
  id: crypto.randomUUID(),
  lottery_master_entry_id: entry.id,
  display_number_snapshot: entry.display_number,
  lottery_name_snapshot: entry.name,
  ticket_price_snapshot: Number(entry.ticket_price ?? 0),
  bundle_size_snapshot: Number(entry.default_bundle_size ?? 100),
  is_locked_snapshot: Boolean(entry.is_locked),
  pack_id: "",
  start_number: 0,
  end_number: 0,
  inclusive_count: false,
  tickets_sold_override: null,
  manual_override_reason: "",
  override_reason: null,
  payouts: 0
});

export const buildLotteryLinesFromMasterEntries = (
  entries: LotteryMasterEntry[]
): LotteryClosingLineSnapshot[] =>
  [...entries]
    .filter((entry) => entry.is_active)
    .sort((a, b) => a.display_number - b.display_number)
    .map((entry) => buildLotteryLineFromMasterEntry(entry));

export const computeSnapshotLineTotals = (line: LotteryClosingLineSnapshot) => {
  const ticketsSold = computeTicketsSold({
    startNumber: Number(line.start_number ?? 0),
    endNumber: Number(line.end_number ?? 0),
    inclusiveCount: Boolean(line.inclusive_count),
    manualOverride: line.tickets_sold_override ?? null
  });
  const salesAmount = computeScratchRevenue(ticketsSold, Number(line.ticket_price_snapshot ?? 0));
  const payouts = Number(line.payouts ?? 0);
  const netAmount = computeLotteryNet({ salesAmount, payouts });

  return {
    ticketsSold,
    salesAmount,
    revenue: salesAmount,
    payouts,
    netAmount
  };
};
