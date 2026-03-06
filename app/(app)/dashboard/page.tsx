import Link from "next/link";
import { requireSessionContext } from "@/lib/auth";
import { getStoreDashboardStats, getTodayClosingForStore } from "@/lib/data/closings";
import { canAccessHistory } from "@/lib/permissions";
import { getMonthlyAnalytics } from "@/lib/analytics/monthly";
import { getLotteryMasterEntriesForStore } from "@/lib/data/lottery-master";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TiltCard } from "@/components/ui/tilt-card";
import { DepthButton } from "@/components/ui/depth-button";
import { SyncNowButton } from "@/components/sync/sync-now-button";
import { PieBreakdown } from "@/components/charts/pie-breakdown";
import { Badge } from "@/components/ui/badge";
import { SyncErrors } from "@/components/sync/sync-errors";
import { OfflineHydrator } from "@/components/sync/offline-hydrator";

export default async function DashboardPage() {
  const context = await requireSessionContext();
  const store = context.activeStore!;
  const stats = await getStoreDashboardStats(store.id);
  const todayClosing = await getTodayClosingForStore(store.id);
  const lotteryMasterEntries = await getLotteryMasterEntriesForStore({
    storeId: store.id,
    onlyActive: true
  });
  const historyAllowed = canAccessHistory(context.membership, store);
  const isStaff = context.membership?.role === "STAFF";
  const isAdmin = context.membership?.role === "ADMIN";
  const hasStaffDraft =
    isStaff && todayClosing?.status === "DRAFT" && todayClosing.created_by === context.userId;
  const hasStaffTodayEntry = isStaff && todayClosing?.created_by === context.userId;
  const now = new Date();
  const monthlySnapshot = isAdmin
    ? await getMonthlyAnalytics({
        storeId: store.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        rangeMonths: 1,
        compareToPreviousMonth: false
      })
    : null;
  const latestProductSales = Math.max(
    0,
    (stats.latest?.gross_collected ?? 0) -
      (stats.latest?.lottery_total_sales ?? 0) -
      (stats.latest?.billpay_collected_total ?? 0)
  );

  const grossPieData = [
    { name: "Products", value: latestProductSales, color: "#dc143c" },
    { name: "Lottery", value: stats.latest?.lottery_total_sales ?? 0, color: "#ff4f2e" },
    {
      name: "Billpay Collected",
      value: stats.latest?.billpay_collected_total ?? 0,
      color: "#ffd166"
    }
  ];
  const paymentPieData = [
    { name: "Cash", value: stats.latest?.cash_amount ?? 0, color: "#06d6a0" },
    { name: "Card", value: stats.latest?.card_amount ?? 0, color: "#118ab2" },
    { name: "EBT", value: stats.latest?.ebt_amount ?? 0, color: "#9b5de5" },
    { name: "Other", value: stats.latest?.other_amount ?? 0, color: "#f15bb5" }
  ];

  return (
    <div className="space-y-6">
      <OfflineHydrator
        stores={[store]}
        closings={stats.closings}
        lotteryMasterEntries={lotteryMasterEntries}
      />
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{store.store_name}</h2>
          <p className="text-sm text-white/70">
            {store.city}, {store.state}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncNowButton />
          <Link href="/closing/new">
            <DepthButton>
              {hasStaffDraft
                ? "Continue Draft"
                : hasStaffTodayEntry
                  ? "View Today Closing"
                  : "New Closing"}
            </DepthButton>
          </Link>
        </div>
      </section>

      {isStaff && todayClosing && todayClosing.status !== "DRAFT" && (
        <div className="surface p-4 text-sm">
          <Badge label="Locked" variant="warn" />
          <p className="mt-2">
            Saved and locked: only admin can edit this closing.
          </p>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TiltCard>
          <p className="text-xs uppercase text-white/70">Today</p>
          <p className="mt-2 text-2xl font-bold">
            {todayClosing ? formatCurrency(todayClosing.gross_collected ?? 0) : "No closing"}
          </p>
          {todayClosing && (
            <p className="mt-1 text-xs text-white/70">
              Status: <span className="font-semibold">{todayClosing.status}</span>
            </p>
          )}
        </TiltCard>
        <TiltCard>
          <p className="text-xs uppercase text-white/70">Week Gross</p>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(stats.weekTotals.gross)}</p>
        </TiltCard>
        <TiltCard>
          <p className="text-xs uppercase text-white/70">Month Gross</p>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(stats.monthTotals.gross)}</p>
        </TiltCard>
        <TiltCard>
          <p className="text-xs uppercase text-white/70">Month True Revenue</p>
          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(stats.monthTotals.trueRevenue)}
          </p>
        </TiltCard>
      </section>

      {isAdmin && monthlySnapshot && (
        <section className="surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Monthly Snapshot ({monthlySnapshot.month_label})
            </h3>
            <Link href={"/reports/monthly" as never}>
              <DepthButton>Open Monthly Analytics</DepthButton>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Gross</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(monthlySnapshot.metrics.total_gross_collected_month)}
              </p>
            </TiltCard>
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Lottery Sales</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(monthlySnapshot.metrics.total_lottery_sales_month)}
              </p>
            </TiltCard>
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Billpay Collected</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(monthlySnapshot.metrics.total_billpay_collected_month)}
              </p>
            </TiltCard>
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Tax Collected</p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(monthlySnapshot.metrics.total_tax_collected_month)}
              </p>
            </TiltCard>
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Scratch Tickets Sold</p>
              <p className="mt-1 text-xl font-bold">
                {monthlySnapshot.metrics.total_scratch_tickets_sold_month}
              </p>
            </TiltCard>
            <TiltCard>
              <p className="text-xs uppercase text-white/70">Top Lottery</p>
              <p className="mt-1 text-base font-semibold">
                {monthlySnapshot.lottery.table[0]?.lottery_name ?? "N/A"}
              </p>
            </TiltCard>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <TiltCard>
          <PieBreakdown title="Gross Collected Breakdown" data={grossPieData} />
        </TiltCard>
        <TiltCard>
          <PieBreakdown title="Payment Method Breakdown" data={paymentPieData} />
        </TiltCard>
      </section>

      {historyAllowed && stats.closings.length > 0 && (
        <section className="surface p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
            Recent Closings
          </h3>
          <div className="space-y-2">
            {stats.closings.slice(0, 5).map((closing) => (
              <Link
                key={closing.id}
                href={`/closing/${closing.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              >
                <span>{formatDate(closing.business_date)}</span>
                <span className="font-semibold">{formatCurrency(closing.gross_collected)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <SyncErrors />
    </div>
  );
}
