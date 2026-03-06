"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { MonthlyAnalyticsPayload } from "@/lib/analytics/monthly";
import { formatCurrency } from "@/lib/utils";
import { offlineDb } from "@/lib/offline/db";
import { PieBreakdown } from "@/components/charts/pie-breakdown";
import { BarBreakdown } from "@/components/charts/bar-breakdown";
import { DepthButton } from "@/components/ui/depth-button";

interface StoreOption {
  id: string;
  store_name: string;
}

interface MonthlyAnalyticsClientProps {
  stores: StoreOption[];
  initialStoreId: string;
  initialMonth: number;
  initialYear: number;
}

const cacheId = ({
  storeId,
  year,
  month,
  rangeMonths,
  compare
}: {
  storeId: string;
  year: number;
  month: number;
  rangeMonths: number;
  compare: boolean;
}) => `${storeId}:${year}:${month}:${rangeMonths}:${compare ? 1 : 0}`;

const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export const MonthlyAnalyticsClient = ({
  stores,
  initialStoreId,
  initialMonth,
  initialYear
}: MonthlyAnalyticsClientProps) => {
  const [storeId, setStoreId] = useState(initialStoreId);
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [rangeMonths, setRangeMonths] = useState(1);
  const [compare, setCompare] = useState(false);
  const [note, setNote] = useState("");
  const [data, setData] = useState<MonthlyAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [pendingPdf, startPdfTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const id = cacheId({ storeId, year, month, rangeMonths, compare });

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/reports/monthly?storeId=${storeId}&month=${month}&year=${year}&rangeMonths=${rangeMonths}&compare=${compare ? 1 : 0}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          data?: MonthlyAnalyticsPayload;
          error?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "Unable to load monthly analytics.");
        }

        if (!active) {
          return;
        }
        setData(payload.data);
        setIsCached(false);
        await offlineDb.monthlyAnalyticsCache.put({
          id,
          store_id: storeId,
          year,
          month,
          range_months: rangeMonths,
          payload: payload.data as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString()
        });
      } catch (error) {
        const cached = await offlineDb.monthlyAnalyticsCache.get(id);
        if (cached?.payload) {
          if (!active) {
            return;
          }
          setData(cached.payload as unknown as MonthlyAnalyticsPayload);
          setIsCached(true);
        } else if (active) {
          setData(null);
          toast.error(error instanceof Error ? error.message : "Monthly analytics unavailable.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [storeId, month, year, rangeMonths, compare]);

  const deltaRows = useMemo(() => {
    if (!data?.compare) {
      return [] as Array<{ label: string; value: string }>;
    }
    const items: Array<{ label: string; item: (typeof data.compare)[keyof typeof data.compare] }> = [
      { label: "Gross Collected", item: data.compare.gross_collected },
      { label: "True Revenue", item: data.compare.true_revenue },
      { label: "Lottery Sales", item: data.compare.lottery_sales },
      { label: "Billpay Collected", item: data.compare.billpay_collected },
      { label: "Tax Collected", item: data.compare.tax_collected },
      { label: "Cash", item: data.compare.cash },
      { label: "Card", item: data.compare.card }
    ];
    return items.map(({ label, item }) => ({
      label,
      value: `${formatCurrency(item.diff)}${
        item.percentChange === null ? "" : ` (${item.percentChange.toFixed(2)}%)`
      }`
    }));
  }, [data]);

  const exportHref = (type: "daily" | "lottery" | "payment" | "billpay") =>
    `/api/reports/monthly/export?storeId=${storeId}&month=${month}&year=${year}&type=${type}`;

  const generatePdf = () => {
    startPdfTransition(async () => {
      try {
        const response = await fetch("/api/reports/monthly/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, month, year, note })
        });
        const payload = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Monthly PDF generation failed.");
        }
        if (payload.url) {
          window.open(payload.url, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Monthly PDF generation failed.");
      }
    });
  };

  const generateClosingPdf = async (closingId: string) => {
    try {
      const response = await fetch(`/api/closings/${closingId}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to generate closing PDF.");
      }
      if (payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate closing PDF.");
    }
  };

  const applyPreset = (preset: "this" | "last" | "last3") => {
    const anchor = new Date();
    if (preset === "last") {
      anchor.setMonth(anchor.getMonth() - 1);
      setRangeMonths(1);
    } else if (preset === "last3") {
      setRangeMonths(3);
    } else {
      setRangeMonths(1);
    }
    if (preset !== "last3") {
      setMonth(anchor.getMonth() + 1);
      setYear(anchor.getFullYear());
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface sticky top-[102px] z-10 p-3">
        <div className="grid gap-2 sm:grid-cols-6">
          <div>
            <label className="field-label">Store</label>
            <select className="field" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.store_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Month</label>
            <select className="field" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {monthOptions.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Year</label>
            <input
              className="field"
              type="number"
              value={year}
              onChange={(event) => setYear(Number(event.target.value || new Date().getFullYear()))}
            />
          </div>
          <div>
            <label className="field-label">Range</label>
            <select
              className="field"
              value={rangeMonths}
              onChange={(event) => setRangeMonths(Number(event.target.value))}
            >
              <option value={1}>1 Month</option>
              <option value={3}>Last 3 Months</option>
            </select>
          </div>
          <label className="mt-6 inline-flex items-center gap-2 text-xs text-white/75">
            <input
              type="checkbox"
              checked={compare}
              disabled={rangeMonths > 1}
              onChange={(event) => setCompare(event.target.checked)}
            />
            Compare To Previous Month
          </label>
          <div className="mt-6 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
              onClick={() => applyPreset("this")}
            >
              This Month
            </button>
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
              onClick={() => applyPreset("last")}
            >
              Last Month
            </button>
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
              onClick={() => applyPreset("last3")}
            >
              Last 3 Months
            </button>
          </div>
        </div>
      </section>

      {loading && <p className="text-sm text-white/70">Loading monthly analytics...</p>}
      {!loading && data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Gross Collected</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_gross_collected_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">True Revenue</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_true_revenue_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Lottery Sales</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_lottery_sales_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Lottery Payouts</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(data.metrics.total_lottery_payouts_month)}
              </p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Lottery Net</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_lottery_net_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Billpay Collected</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_billpay_collected_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Billpay Fee Revenue</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(data.metrics.total_billpay_fee_revenue_month)}
              </p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Tax Collected</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.total_tax_collected_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Scratch Tickets Sold</p>
              <p className="mt-1 text-xl font-bold">{data.metrics.total_scratch_tickets_sold_month}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Average Daily Gross</p>
              <p className="mt-1 text-xl font-bold">{formatCurrency(data.metrics.avg_daily_gross_month)}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Closing Count</p>
              <p className="mt-1 text-xl font-bold">{data.metrics.total_closings_count_month}</p>
            </div>
            <div className="surface p-3">
              <p className="text-xs uppercase text-white/70">Best Closing Day</p>
              <p className="mt-1 text-base font-semibold">
                {data.metrics.best_closing_day
                  ? `${data.metrics.best_closing_day.date} · ${formatCurrency(data.metrics.best_closing_day.gross_collected)}`
                  : "N/A"}
              </p>
            </div>
          </section>
          <p className="text-xs text-white/65">
            Gross Collected includes pass-through collections (lottery and billpay based on store
            toggles). True Revenue reflects earned revenue after lottery payouts plus billpay fee
            revenue.
          </p>

          {isCached && (
            <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Cached data shown (offline-aware view). Refresh when online to sync latest cross-device updates.
            </p>
          )}

          {deltaRows.length > 0 && (
            <section className="surface p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                Previous Month Comparison
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {deltaRows.map((row) => (
                  <p key={row.label} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                    {row.label}: <strong>{row.value}</strong>
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="surface p-3">
              <PieBreakdown title="Revenue Category Breakdown" data={data.charts.revenue_categories} />
            </div>
            <div className="surface p-3">
              <PieBreakdown title="Payment Method Breakdown" data={data.charts.payment_methods} />
            </div>
            <div className="surface p-3">
              <BarBreakdown
                title="Top Lottery Names By Tickets Sold"
                data={data.charts.top_lottery_tickets}
              />
            </div>
            <div className="surface p-3">
              <PieBreakdown title="Lottery Revenue Share" data={data.charts.lottery_revenue_share} />
            </div>
            <div className="surface p-3 lg:col-span-2">
              <BarBreakdown
                title="Taxable vs Non-Taxable Sales"
                data={data.charts.taxable_vs_non_taxable}
                currency
              />
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Lottery Breakdown By Game
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Lottery</th>
                    <th className="px-2 py-2">Lines</th>
                    <th className="px-2 py-2">Tickets</th>
                    <th className="px-2 py-2">Avg Price</th>
                    <th className="px-2 py-2">Sales</th>
                    <th className="px-2 py-2">Payouts</th>
                    <th className="px-2 py-2">Net</th>
                    <th className="px-2 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lottery.table.map((row) => (
                    <tr key={`${row.display_number}-${row.lottery_name}`} className="border-t border-white/10">
                      <td className="px-2 py-2">{row.display_number}</td>
                      <td className="px-2 py-2">{row.lottery_name}</td>
                      <td className="px-2 py-2">{row.total_ticket_lines_count}</td>
                      <td className="px-2 py-2">{row.total_tickets_sold}</td>
                      <td className="px-2 py-2">{formatCurrency(row.avg_ticket_price)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.total_scratch_sales)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.total_scratch_payouts)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.total_scratch_net)}</td>
                      <td className="px-2 py-2 align-top">
                        <details>
                          <summary className="cursor-pointer text-[11px] text-white/80">
                            Expand
                          </summary>
                          <div className="mt-1 space-y-1">
                            {row.details.slice(0, 8).map((detail, idx) => (
                              <p key={`${row.lottery_name}-${idx}`} className="text-[10px] text-white/65">
                                {detail.closing_date}: {detail.start_number}-{detail.end_number} · sold{" "}
                                {detail.tickets_sold} · {formatCurrency(detail.scratch_sales)} · payouts{" "}
                                {formatCurrency(detail.payouts)}
                              </p>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-[11px]">
                <thead className="text-left uppercase tracking-wide text-white/55">
                  <tr>
                    <th className="px-2 py-1">Display #</th>
                    <th className="px-2 py-1">Tickets</th>
                    <th className="px-2 py-1">Sales</th>
                    <th className="px-2 py-1">Payouts</th>
                    <th className="px-2 py-1">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lottery.by_display_number.map((row) => (
                    <tr key={row.display_number} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.display_number}</td>
                      <td className="px-2 py-1">{row.total_tickets_sold}</td>
                      <td className="px-2 py-1">{formatCurrency(row.total_sales)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.total_payouts)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.total_net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Payment Breakdown
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Percent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.rows.map((row) => (
                    <tr key={row.name} className="border-t border-white/10">
                      <td className="px-2 py-2">{row.name}</td>
                      <td className="px-2 py-2">{formatCurrency(row.amount)}</td>
                      <td className="px-2 py-2">{row.percent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Tax Breakdown
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <tbody>
                  <tr className="border-t border-white/10">
                    <td className="px-2 py-2">Total Taxable Sales</td>
                    <td className="px-2 py-2">{formatCurrency(data.tax.total_taxable_sales)}</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-2 py-2">Total Non-Taxable Sales</td>
                    <td className="px-2 py-2">
                      {formatCurrency(data.tax.total_non_taxable_sales)}
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-2 py-2">Total Tax Collected</td>
                    <td className="px-2 py-2">{formatCurrency(data.tax.total_tax_collected)}</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-2 py-2">Avg Daily Taxable Sales</td>
                    <td className="px-2 py-2">
                      {formatCurrency(data.tax.avg_daily_taxable_sales)}
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-2 py-2">Avg Daily Tax Collected</td>
                    <td className="px-2 py-2">
                      {formatCurrency(data.tax.avg_daily_tax_collected)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Billpay Breakdown
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Collected</th>
                    <th className="px-2 py-2">Fee Revenue</th>
                    <th className="px-2 py-2">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.billpay.provider_breakdown.map((row) => (
                    <tr key={row.provider} className="border-t border-white/10">
                      <td className="px-2 py-2">{row.provider}</td>
                      <td className="px-2 py-2">{formatCurrency(row.total_collected)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.total_fee_revenue)}</td>
                      <td className="px-2 py-2">{row.transaction_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Daily Performance
            </h3>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Gross</th>
                    <th className="px-2 py-2">True Rev</th>
                    <th className="px-2 py-2">Lottery Sales</th>
                    <th className="px-2 py-2">Lottery Payouts</th>
                    <th className="px-2 py-2">Billpay</th>
                    <th className="px-2 py-2">Taxable</th>
                    <th className="px-2 py-2">Non-Taxable</th>
                    <th className="px-2 py-2">Tax</th>
                    <th className="px-2 py-2">Cash</th>
                    <th className="px-2 py-2">Card</th>
                    <th className="px-2 py-2">Tickets</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily_performance.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="px-2 py-2">{row.date}</td>
                      <td className="px-2 py-2">{row.status}</td>
                      <td className="px-2 py-2">{formatCurrency(row.gross_collected)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.true_revenue)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.lottery_sales)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.lottery_payouts)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.billpay_collected)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.taxable_sales)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.non_taxable_sales)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.tax_amount)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.cash)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.card)}</td>
                      <td className="px-2 py-2">{row.tickets_sold_total}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <a
                            href={`/closing/${row.id}`}
                            className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                          >
                            View
                          </a>
                          <button
                            type="button"
                            className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                            onClick={() => void generateClosingPdf(row.id)}
                          >
                            Print PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/70">
              Exports
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <a className="rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10" href={exportHref("daily")}>
                Export Daily CSV
              </a>
              <a className="rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10" href={exportHref("lottery")}>
                Export Lottery CSV
              </a>
              <a className="rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10" href={exportHref("payment")}>
                Export Payment CSV
              </a>
              <a className="rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10" href={exportHref("billpay")}>
                Export Billpay CSV
              </a>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <textarea
                className="field"
                rows={3}
                placeholder="Optional monthly note for PDF report"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <DepthButton type="button" disabled={pendingPdf || rangeMonths > 1} onClick={generatePdf}>
                {pendingPdf ? "Generating..." : "Generate Monthly PDF"}
              </DepthButton>
            </div>
            {rangeMonths > 1 && (
              <p className="mt-1 text-xs text-white/60">
                PDF generation is available for single-month selection.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
};
