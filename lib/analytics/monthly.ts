import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths
} from "date-fns";
import { isSupabaseMissingTableError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LotteryMasterEntry } from "@/lib/types";
import { toMoney } from "@/lib/utils";

interface MonthlyRange {
  start: string;
  end: string;
}

interface MonthlyRawData {
  range: MonthlyRange;
  closings: Record<string, unknown>[];
  lotteryLines: Record<string, unknown>[];
  billpayLines: Record<string, unknown>[];
  paymentLines: Record<string, unknown>[];
  lotteryMasterEntries: LotteryMasterEntry[];
}

interface CompareDelta {
  current: number;
  previous: number;
  diff: number;
  percentChange: number | null;
}

export interface MonthlyAnalyticsPayload {
  store_id: string;
  month: number;
  year: number;
  range_months: number;
  range_start: string;
  range_end: string;
  month_label: string;
  metrics: ReturnType<typeof aggregateMonthlyClosingData>;
  lottery: ReturnType<typeof aggregateMonthlyLotteryData>;
  payments: ReturnType<typeof aggregateMonthlyPaymentData>;
  tax: {
    total_taxable_sales: number;
    total_non_taxable_sales: number;
    total_tax_collected: number;
    avg_daily_taxable_sales: number;
    avg_daily_tax_collected: number;
  };
  billpay: ReturnType<typeof aggregateMonthlyBillpayData>;
  daily_performance: Array<{
    id: string;
    date: string;
    status: string;
    gross_collected: number;
    true_revenue: number;
    scratch_revenue: number;
    online_amount: number;
    paid_out_amount: number;
    amount_due: number;
    lottery_sales: number;
    lottery_payouts: number;
    billpay_collected: number;
    taxable_sales: number;
    non_taxable_sales: number;
    tax_amount: number;
    cash: number;
    card: number;
    tickets_sold_total: number;
  }>;
  charts: {
    revenue_categories: Array<{ name: string; value: number; color: string }>;
    payment_methods: Array<{ name: string; value: number; color: string }>;
    top_lottery_tickets: Array<{ name: string; value: number; color: string }>;
    lottery_revenue_share: Array<{ name: string; value: number; color: string }>;
    taxable_vs_non_taxable: Array<{ name: string; value: number; color: string }>;
  };
  compare: null | {
    gross_collected: CompareDelta;
    true_revenue: CompareDelta;
    lottery_sales: CompareDelta;
    billpay_collected: CompareDelta;
    tax_collected: CompareDelta;
    cash: CompareDelta;
    card: CompareDelta;
  };
}

const createMonthRange = ({
  month,
  year,
  rangeMonths = 1
}: {
  month: number;
  year: number;
  rangeMonths?: number;
}): MonthlyRange => {
  const monthIndex = Math.max(1, Math.min(12, month)) - 1;
  const anchor = new Date(year, monthIndex, 1);
  const start = startOfMonth(subMonths(anchor, Math.max(0, rangeMonths - 1)));
  const end = endOfMonth(anchor);
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd")
  };
};

const sum = (rows: Record<string, unknown>[], key: string) =>
  toMoney(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0));

const percentage = (amount: number, total: number) =>
  total > 0 ? toMoney((amount / total) * 100) : 0;

const toDelta = (current: number, previous: number): CompareDelta => ({
  current: toMoney(current),
  previous: toMoney(previous),
  diff: toMoney(current - previous),
  percentChange: previous === 0 ? null : toMoney(((current - previous) / previous) * 100)
});

const loadMonthlyRawData = async ({
  storeId,
  month,
  year,
  rangeMonths = 1
}: {
  storeId: string;
  month: number;
  year: number;
  rangeMonths?: number;
}): Promise<MonthlyRawData> => {
  const supabase = await createSupabaseServerClient();
  const range = createMonthRange({ month, year, rangeMonths });

  const { data: closings, error: closingError } = await supabase
    .from("closing_days")
    .select("*")
    .eq("store_id", storeId)
    .gte("business_date", range.start)
    .lte("business_date", range.end)
    .order("business_date", { ascending: true })
    .limit(2000);

  if (closingError) {
    throw closingError;
  }

  const closingIds = (closings ?? []).map((row) => String(row.id));

  const [lotteryResult, billpayResult, paymentResult, masterResult] = await Promise.all([
    closingIds.length > 0
      ? supabase
          .from("lottery_scratch_lines")
          .select("*")
          .in("closing_day_id", closingIds)
      : Promise.resolve({ data: [], error: null }),
    closingIds.length > 0
      ? supabase.from("billpay_lines").select("*").in("closing_day_id", closingIds)
      : Promise.resolve({ data: [], error: null }),
    closingIds.length > 0
      ? supabase.from("payment_lines").select("*").in("closing_day_id", closingIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("lottery_master_entries")
      .select("*")
      .eq("store_id", storeId)
      .order("display_number", { ascending: true })
  ]);

  if (lotteryResult.error) {
    throw lotteryResult.error;
  }
  if (billpayResult.error) {
    throw billpayResult.error;
  }
  if (
    paymentResult.error &&
    !isSupabaseMissingTableError(paymentResult.error, "payment_lines")
  ) {
    throw paymentResult.error;
  }
  if (
    masterResult.error &&
    !isSupabaseMissingTableError(masterResult.error, "lottery_master_entries")
  ) {
    throw masterResult.error;
  }

  return {
    range,
    closings: (closings ?? []) as Record<string, unknown>[],
    lotteryLines: (lotteryResult.data ?? []) as Record<string, unknown>[],
    billpayLines: (billpayResult.data ?? []) as Record<string, unknown>[],
    paymentLines: (paymentResult.data ?? []) as Record<string, unknown>[],
    lotteryMasterEntries: (masterResult.data ?? []) as LotteryMasterEntry[]
  };
};

export const aggregateMonthlyClosingData = (closings: Record<string, unknown>[]) => {
  const totalGross = sum(closings, "gross_collected");
  const totalTrueRevenue = sum(closings, "true_revenue");
  const totalTaxable = sum(closings, "taxable_sales");
  const totalNonTaxable = sum(closings, "non_taxable_sales");
  const totalTax = sum(closings, "tax_amount");
  const totalCash = sum(closings, "cash_amount");
  const totalCard = sum(closings, "card_amount");
  const totalEbt = sum(closings, "ebt_amount");
  const totalOther = sum(closings, "other_amount");
  const totalLotterySales = sum(closings, "lottery_total_sales");
  const totalLotteryPayouts = sum(closings, "lottery_total_payouts");
  const totalLotteryNet = toMoney(totalLotterySales - totalLotteryPayouts);
  const totalLotteryScratchRevenue = sum(closings, "lottery_total_scratch_revenue");
  const totalLotteryOnline = sum(closings, "lottery_online_amount");
  const totalLotteryPaidOut = sum(closings, "lottery_paid_out_amount");
  const totalLotteryAmountDue = sum(closings, "lottery_amount_due");
  const totalBillpayCollected = sum(closings, "billpay_collected_total");
  const totalBillpayFeeRevenue = sum(closings, "billpay_fee_revenue");

  const closingCount = closings.length;
  const avgDailyGross = closingCount > 0 ? toMoney(totalGross / closingCount) : 0;
  const avgDailyTrueRevenue = closingCount > 0 ? toMoney(totalTrueRevenue / closingCount) : 0;

  const bestClosing = [...closings].sort(
    (a, b) => Number(b.gross_collected ?? 0) - Number(a.gross_collected ?? 0)
  )[0];

  return {
    total_gross_collected_month: totalGross,
    total_true_revenue_month: totalTrueRevenue,
    total_taxable_sales_month: totalTaxable,
    total_non_taxable_sales_month: totalNonTaxable,
    total_tax_collected_month: totalTax,
    total_cash_month: totalCash,
    total_card_month: totalCard,
    total_ebt_month: totalEbt,
    total_other_payments_month: totalOther,
    total_lottery_scratch_revenue_month: totalLotteryScratchRevenue,
    total_lottery_online_amount_month: totalLotteryOnline,
    total_lottery_paid_out_month: totalLotteryPaidOut,
    total_lottery_amount_due_month: totalLotteryAmountDue,
    total_lottery_sales_month: totalLotterySales,
    total_lottery_payouts_month: totalLotteryPayouts,
    total_lottery_net_month: totalLotteryNet,
    total_billpay_collected_month: totalBillpayCollected,
    total_billpay_fee_revenue_month: totalBillpayFeeRevenue,
    total_scratch_tickets_sold_month: 0,
    total_closings_count_month: closingCount,
    avg_daily_gross_month: avgDailyGross,
    avg_daily_true_revenue_month: avgDailyTrueRevenue,
    best_closing_day: bestClosing
      ? {
          date: String(bestClosing.business_date),
          gross_collected: Number(bestClosing.gross_collected ?? 0),
          true_revenue: Number(bestClosing.true_revenue ?? 0)
        }
      : null
  };
};

export const aggregateMonthlyLotteryData = ({
  lotteryLines,
  closings,
  lotteryMasterEntries
}: {
  lotteryLines: Record<string, unknown>[];
  closings: Record<string, unknown>[];
  lotteryMasterEntries: LotteryMasterEntry[];
}) => {
  const closingById = new Map<string, Record<string, unknown>>();
  closings.forEach((closing) => {
    closingById.set(String(closing.id), closing);
  });

  const masterById = new Map<string, LotteryMasterEntry>();
  lotteryMasterEntries.forEach((entry) => {
    masterById.set(entry.id, entry);
  });

  const grouped = new Map<
    string,
    {
      lottery_master_entry_id: string | null;
      display_number: number;
      lottery_name: string;
      total_ticket_lines_count: number;
      total_tickets_sold: number;
      total_ticket_price: number;
      total_scratch_sales: number;
      total_scratch_payouts: number;
      total_scratch_net: number;
      details: Array<{
        closing_date: string;
        start_number: number;
        end_number: number;
        tickets_sold: number;
        ticket_price: number;
        payouts: number;
        scratch_sales: number;
        entered_by: string | null;
      }>;
    }
  >();

  let totalScratchSales = 0;
  let totalScratchPayouts = 0;
  let totalScratchTicketsSold = 0;
  const scratchSalesByClosing = new Map<string, number>();
  const scratchPayoutsByClosing = new Map<string, number>();

  lotteryLines.forEach((line, index) => {
    const masterId =
      line.lottery_master_entry_id === null || line.lottery_master_entry_id === undefined
        ? null
        : String(line.lottery_master_entry_id);
    const displayNumber = Number(line.display_number_snapshot ?? index + 1);
    const fallbackName = String(line.lottery_name_snapshot ?? line.game_name ?? "Lottery");
    const master = masterId ? masterById.get(masterId) : null;
    const lotteryName = master?.name ?? fallbackName;
    const key = masterId ?? `snapshot:${displayNumber}:${fallbackName}`;

    const ticketsSold = Number(line.tickets_sold ?? line.tickets_sold_computed ?? 0);
    const ticketPrice = Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0);
    const scratchSales = Number(line.sales_amount ?? line.scratch_sales ?? 0);
    const scratchPayouts = Number(line.payouts ?? line.scratch_payouts ?? 0);
    const scratchNet = toMoney(scratchSales - scratchPayouts);

    totalScratchSales = toMoney(totalScratchSales + scratchSales);
    totalScratchPayouts = toMoney(totalScratchPayouts + scratchPayouts);
    totalScratchTicketsSold += ticketsSold;

    const closingId = String(line.closing_day_id ?? "");
    if (closingId) {
      scratchSalesByClosing.set(
        closingId,
        toMoney((scratchSalesByClosing.get(closingId) ?? 0) + scratchSales)
      );
      scratchPayoutsByClosing.set(
        closingId,
        toMoney((scratchPayoutsByClosing.get(closingId) ?? 0) + scratchPayouts)
      );
    }

    const existing =
      grouped.get(key) ??
      {
        lottery_master_entry_id: masterId,
        display_number: displayNumber,
        lottery_name: lotteryName,
        total_ticket_lines_count: 0,
        total_tickets_sold: 0,
        total_ticket_price: 0,
        total_scratch_sales: 0,
        total_scratch_payouts: 0,
        total_scratch_net: 0,
        details: []
      };

    existing.total_ticket_lines_count += 1;
    existing.total_tickets_sold += ticketsSold;
    existing.total_ticket_price = toMoney(existing.total_ticket_price + ticketPrice);
    existing.total_scratch_sales = toMoney(existing.total_scratch_sales + scratchSales);
    existing.total_scratch_payouts = toMoney(existing.total_scratch_payouts + scratchPayouts);
    existing.total_scratch_net = toMoney(existing.total_scratch_net + scratchNet);

    const closing = closingById.get(String(line.closing_day_id));
    existing.details.push({
      closing_date: String(closing?.business_date ?? ""),
      start_number: Number(line.start_number ?? line.start_ticket_number ?? 0),
      end_number: Number(line.end_number ?? line.end_ticket_number ?? 0),
      tickets_sold: ticketsSold,
      ticket_price: ticketPrice,
      payouts: scratchPayouts,
      scratch_sales: scratchSales,
      entered_by:
        closing?.created_by === null || closing?.created_by === undefined
          ? null
          : String(closing.created_by)
    });

    grouped.set(key, existing);
  });

  const table = Array.from(grouped.values())
    .map((row) => ({
      ...row,
      avg_ticket_price:
        row.total_ticket_lines_count > 0
          ? toMoney(row.total_ticket_price / row.total_ticket_lines_count)
          : 0
    }))
    .sort((a, b) => b.total_scratch_sales - a.total_scratch_sales);

  const byDisplayNumber = table
    .reduce((acc, row) => {
      const key = row.display_number;
      const current =
        acc.get(key) ??
        {
          display_number: key,
          total_tickets_sold: 0,
          total_sales: 0,
          total_payouts: 0,
          total_net: 0
        };
      current.total_tickets_sold += row.total_tickets_sold;
      current.total_sales = toMoney(current.total_sales + row.total_scratch_sales);
      current.total_payouts = toMoney(current.total_payouts + row.total_scratch_payouts);
      current.total_net = toMoney(current.total_net + row.total_scratch_net);
      acc.set(key, current);
      return acc;
    }, new Map<number, { display_number: number; total_tickets_sold: number; total_sales: number; total_payouts: number; total_net: number }>())
    .values();

  let totalScratchRevenue = 0;
  let totalOnlineAmount = 0;
  let totalPaidOutAmount = 0;
  let totalAmountDue = 0;

  closings.forEach((closing) => {
    const closingId = String(closing.id ?? "");
    const scratchRevenue = Number(
      closing.lottery_total_scratch_revenue ?? scratchSalesByClosing.get(closingId) ?? 0
    );
    const onlineAmount = Number(closing.lottery_online_amount ?? closing.draw_sales ?? 0);
    const paidOutAmount = Number(
      closing.lottery_paid_out_amount ??
        (scratchPayoutsByClosing.get(closingId) ?? 0) + Number(closing.draw_payouts ?? 0)
    );
    const amountDue = Number(
      closing.lottery_amount_due ?? scratchRevenue - paidOutAmount + onlineAmount
    );

    totalScratchRevenue = toMoney(totalScratchRevenue + scratchRevenue);
    totalOnlineAmount = toMoney(totalOnlineAmount + onlineAmount);
    totalPaidOutAmount = toMoney(totalPaidOutAmount + paidOutAmount);
    totalAmountDue = toMoney(totalAmountDue + amountDue);
  });

  const totalLotterySales = sum(closings, "lottery_total_sales");
  const totalLotteryPayouts = sum(closings, "lottery_total_payouts");
  const totalLotteryNet = sum(closings, "lottery_net");

  return {
    summary: {
      total_scratch_revenue: toMoney(totalScratchRevenue || totalScratchSales),
      total_online_amount: totalOnlineAmount,
      total_paid_out_amount: totalPaidOutAmount,
      total_amount_due: totalAmountDue,
      total_scratch_sales: toMoney(totalScratchRevenue || totalScratchSales),
      total_lottery_sales: totalLotterySales,
      total_lottery_payouts: totalLotteryPayouts,
      total_lottery_net: totalLotteryNet,
      total_scratch_payouts: toMoney(totalScratchPayouts),
      total_scratch_tickets_sold: totalScratchTicketsSold
    },
    table,
    by_display_number: Array.from(byDisplayNumber).sort((a, b) => a.display_number - b.display_number)
  };
};

export const aggregateMonthlyPaymentData = ({
  closings,
  paymentLines
}: {
  closings: Record<string, unknown>[];
  paymentLines: Record<string, unknown>[];
}) => {
  const byType = new Map<string, number>([
    ["cash", 0],
    ["card", 0],
    ["ebt", 0],
    ["other", 0]
  ]);
  const closingsWithLines = new Set<string>();

  if (paymentLines.length > 0) {
    paymentLines.forEach((line) => {
      const type = String(line.payment_type ?? "").toLowerCase();
      if (!byType.has(type)) {
        return;
      }
      const closingId = String(line.closing_day_id ?? "");
      if (closingId) {
        closingsWithLines.add(closingId);
      }
      byType.set(type, toMoney((byType.get(type) ?? 0) + Number(line.amount ?? 0)));
    });
  }

  closings.forEach((closing) => {
    const closingId = String(closing.id ?? "");
    if (closingId && closingsWithLines.has(closingId)) {
      return;
    }
    byType.set("cash", toMoney((byType.get("cash") ?? 0) + Number(closing.cash_amount ?? 0)));
    byType.set("card", toMoney((byType.get("card") ?? 0) + Number(closing.card_amount ?? 0)));
    byType.set("ebt", toMoney((byType.get("ebt") ?? 0) + Number(closing.ebt_amount ?? 0)));
    byType.set("other", toMoney((byType.get("other") ?? 0) + Number(closing.other_amount ?? 0)));
  });

  const cash = byType.get("cash") ?? 0;
  const card = byType.get("card") ?? 0;
  const ebt = byType.get("ebt") ?? 0;
  const other = byType.get("other") ?? 0;
  const total = toMoney(cash + card + ebt + other);

  return {
    total,
    rows: [
      { name: "Cash", amount: cash, percent: percentage(cash, total), color: "#06d6a0" },
      { name: "Card", amount: card, percent: percentage(card, total), color: "#118ab2" },
      { name: "EBT", amount: ebt, percent: percentage(ebt, total), color: "#f4a261" },
      { name: "Other", amount: other, percent: percentage(other, total), color: "#adb5bd" }
    ]
  };
};

export const aggregateMonthlyBillpayData = ({
  closings,
  billpayLines
}: {
  closings: Record<string, unknown>[];
  billpayLines: Record<string, unknown>[];
}) => {
  const totalBillpayCollected = sum(closings, "billpay_collected_total");
  const totalBillpayFeeRevenue = sum(closings, "billpay_fee_revenue");
  const totalTransactionCount = billpayLines.reduce(
    (count, line) => count + Number(line.txn_count ?? 0),
    0
  );

  const byProvider = new Map<
    string,
    { provider: string; total_collected: number; total_fee_revenue: number; transaction_count: number }
  >();

  billpayLines.forEach((line) => {
    const provider = String(line.provider_name ?? "Unspecified");
    const existing =
      byProvider.get(provider) ??
      {
        provider,
        total_collected: 0,
        total_fee_revenue: 0,
        transaction_count: 0
      };

    existing.total_collected = toMoney(
      existing.total_collected + Number(line.amount_collected ?? 0)
    );
    existing.total_fee_revenue = toMoney(
      existing.total_fee_revenue + Number(line.fee_revenue ?? 0)
    );
    existing.transaction_count += Number(line.txn_count ?? 0);

    byProvider.set(provider, existing);
  });

  return {
    total_billpay_collected: totalBillpayCollected,
    total_billpay_fee_revenue: totalBillpayFeeRevenue,
    total_billpay_transaction_count: totalTransactionCount,
    provider_breakdown: Array.from(byProvider.values()).sort(
      (a, b) => b.total_collected - a.total_collected
    )
  };
};

export const getMonthlyAnalytics = async ({
  storeId,
  month,
  year,
  rangeMonths = 1,
  compareToPreviousMonth = false
}: {
  storeId: string;
  month: number;
  year: number;
  rangeMonths?: number;
  compareToPreviousMonth?: boolean;
}): Promise<MonthlyAnalyticsPayload> => {
  const normalizedMonth = Math.max(1, Math.min(12, month));
  const normalizedRangeMonths = Math.max(1, Math.min(3, rangeMonths));

  const raw = await loadMonthlyRawData({
    storeId,
    month: normalizedMonth,
    year,
    rangeMonths: normalizedRangeMonths
  });

  const lottery = aggregateMonthlyLotteryData({
    lotteryLines: raw.lotteryLines,
    closings: raw.closings,
    lotteryMasterEntries: raw.lotteryMasterEntries
  });
  const metrics = {
    ...aggregateMonthlyClosingData(raw.closings),
    total_lottery_scratch_revenue_month: lottery.summary.total_scratch_revenue,
    total_lottery_online_amount_month: lottery.summary.total_online_amount,
    total_lottery_paid_out_month: lottery.summary.total_paid_out_amount,
    total_lottery_amount_due_month: lottery.summary.total_amount_due,
    total_scratch_tickets_sold_month: lottery.summary.total_scratch_tickets_sold
  };
  const payments = aggregateMonthlyPaymentData({
    closings: raw.closings,
    paymentLines: raw.paymentLines
  });
  metrics.total_cash_month = payments.rows.find((row) => row.name === "Cash")?.amount ?? 0;
  metrics.total_card_month = payments.rows.find((row) => row.name === "Card")?.amount ?? 0;
  metrics.total_ebt_month = payments.rows.find((row) => row.name === "EBT")?.amount ?? 0;
  metrics.total_other_payments_month =
    payments.rows.find((row) => row.name === "Other")?.amount ?? 0;
  const billpay = aggregateMonthlyBillpayData({
    closings: raw.closings,
    billpayLines: raw.billpayLines
  });

  const closingTicketsById = new Map<string, number>();
  const closingScratchRevenueById = new Map<string, number>();
  const closingLegacyPayoutById = new Map<string, number>();
  raw.lotteryLines.forEach((line) => {
    const closingId = String(line.closing_day_id);
    const current = closingTicketsById.get(closingId) ?? 0;
    closingTicketsById.set(
      closingId,
      current + Number(line.tickets_sold ?? line.tickets_sold_computed ?? 0)
    );
    closingScratchRevenueById.set(
      closingId,
      toMoney(
        (closingScratchRevenueById.get(closingId) ?? 0) +
          Number(line.sales_amount ?? line.scratch_sales ?? 0)
      )
    );
    closingLegacyPayoutById.set(
      closingId,
      toMoney(
        (closingLegacyPayoutById.get(closingId) ?? 0) +
          Number(line.payouts ?? line.scratch_payouts ?? 0)
      )
    );
  });

  const dailyPerformance = raw.closings
    .map((closing) => {
      const closingId = String(closing.id);
      const scratchRevenue = Number(
        closing.lottery_total_scratch_revenue ?? closingScratchRevenueById.get(closingId) ?? 0
      );
      const onlineAmount = Number(closing.lottery_online_amount ?? closing.draw_sales ?? 0);
      const paidOutAmount = Number(
        closing.lottery_paid_out_amount ??
          (closingLegacyPayoutById.get(closingId) ?? 0) + Number(closing.draw_payouts ?? 0)
      );
      const amountDue = Number(
        closing.lottery_amount_due ?? scratchRevenue - paidOutAmount + onlineAmount
      );

      return {
        id: closingId,
        date: String(closing.business_date),
        status: String(closing.status ?? "DRAFT"),
        gross_collected: Number(closing.gross_collected ?? 0),
        true_revenue: Number(closing.true_revenue ?? 0),
        scratch_revenue: scratchRevenue,
        online_amount: onlineAmount,
        paid_out_amount: paidOutAmount,
        amount_due: amountDue,
        lottery_sales: Number(closing.lottery_total_sales ?? 0),
        lottery_payouts: Number(closing.lottery_total_payouts ?? 0),
        billpay_collected: Number(closing.billpay_collected_total ?? 0),
        taxable_sales: Number(closing.taxable_sales ?? 0),
        non_taxable_sales: Number(closing.non_taxable_sales ?? 0),
        tax_amount: Number(closing.tax_amount ?? 0),
        cash: Number(closing.cash_amount ?? 0),
        card: Number(closing.card_amount ?? 0),
        tickets_sold_total: closingTicketsById.get(closingId) ?? 0
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const tax = {
    total_taxable_sales: metrics.total_taxable_sales_month,
    total_non_taxable_sales: metrics.total_non_taxable_sales_month,
    total_tax_collected: metrics.total_tax_collected_month,
    avg_daily_taxable_sales:
      metrics.total_closings_count_month > 0
        ? toMoney(metrics.total_taxable_sales_month / metrics.total_closings_count_month)
        : 0,
    avg_daily_tax_collected:
      metrics.total_closings_count_month > 0
        ? toMoney(metrics.total_tax_collected_month / metrics.total_closings_count_month)
        : 0
  };

  const charts = {
    revenue_categories: [
      { name: "Product Sales", value: sum(raw.closings, "total_sales_gross"), color: "#dc143c" },
      {
        name: "Lottery Sales",
        value: metrics.total_lottery_sales_month,
        color: "#ff4f2e"
      },
      {
        name: "Billpay Collected",
        value: metrics.total_billpay_collected_month,
        color: "#ffd166"
      }
    ],
    payment_methods: payments.rows.map((row) => ({
      name: row.name,
      value: row.amount,
      color: row.color
    })),
    top_lottery_tickets: lottery.table.slice(0, 8).map((item) => ({
      name: item.lottery_name,
      value: item.total_tickets_sold,
      color: "#ff4f2e"
    })),
    lottery_revenue_share: lottery.table.slice(0, 8).map((item, index) => ({
      name: item.lottery_name,
      value: item.total_scratch_sales,
      color: ["#ff4f2e", "#ffd166", "#06d6a0", "#118ab2", "#f4a261", "#adb5bd"][
        index % 6
      ]
    })),
    taxable_vs_non_taxable: [
      { name: "Taxable", value: tax.total_taxable_sales, color: "#dc143c" },
      { name: "Non-Taxable", value: tax.total_non_taxable_sales, color: "#118ab2" }
    ]
  };

  let compare: MonthlyAnalyticsPayload["compare"] = null;
  if (compareToPreviousMonth && normalizedRangeMonths === 1) {
    const previousAnchor = subMonths(new Date(year, normalizedMonth - 1, 1), 1);
    const previous = await loadMonthlyRawData({
      storeId,
      month: previousAnchor.getMonth() + 1,
      year: previousAnchor.getFullYear(),
      rangeMonths: 1
    });
    const previousMetrics = aggregateMonthlyClosingData(previous.closings);
    const previousPayments = aggregateMonthlyPaymentData({
      closings: previous.closings,
      paymentLines: previous.paymentLines
    });

    compare = {
      gross_collected: toDelta(
        metrics.total_gross_collected_month,
        previousMetrics.total_gross_collected_month
      ),
      true_revenue: toDelta(
        metrics.total_true_revenue_month,
        previousMetrics.total_true_revenue_month
      ),
      lottery_sales: toDelta(
        metrics.total_lottery_sales_month,
        previousMetrics.total_lottery_sales_month
      ),
      billpay_collected: toDelta(
        metrics.total_billpay_collected_month,
        previousMetrics.total_billpay_collected_month
      ),
      tax_collected: toDelta(
        metrics.total_tax_collected_month,
        previousMetrics.total_tax_collected_month
      ),
      cash: toDelta(
        metrics.total_cash_month,
        previousPayments.rows.find((row) => row.name === "Cash")?.amount ?? 0
      ),
      card: toDelta(
        metrics.total_card_month,
        previousPayments.rows.find((row) => row.name === "Card")?.amount ?? 0
      )
    };
  }

  return {
    store_id: storeId,
    month: normalizedMonth,
    year,
    range_months: normalizedRangeMonths,
    range_start: raw.range.start,
    range_end: raw.range.end,
    month_label: format(new Date(year, normalizedMonth - 1, 1), "MMMM yyyy"),
    metrics,
    lottery,
    payments,
    tax,
    billpay,
    daily_performance: dailyPerformance,
    charts,
    compare
  };
};
