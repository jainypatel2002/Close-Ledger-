import { requireAdmin } from "@/lib/auth";
import { MonthlyAnalyticsClient } from "@/components/reports/monthly-analytics-client";

export default async function MonthlyReportsPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const context = await requireAdmin();
  const params = await searchParams;
  const now = new Date();

  const month = Number(params.month ?? now.getMonth() + 1);
  const year = Number(params.year ?? now.getFullYear());

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-bold">Monthly Revenue Analytics</h2>
        <p className="text-sm text-white/70">
          Admin-only monthly gross collected vs true revenue analytics with exports.
        </p>
      </header>
      <MonthlyAnalyticsClient
        stores={context.stores.map((store) => ({ id: store.id, store_name: store.store_name }))}
        initialStoreId={context.activeStore!.id}
        initialMonth={month}
        initialYear={year}
      />
    </div>
  );
}
