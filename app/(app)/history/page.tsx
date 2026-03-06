import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext } from "@/lib/auth";
import { getClosingsForStore } from "@/lib/data/closings";
import { canAccessHistory } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { OfflineHydrator } from "@/components/sync/offline-hydrator";

export default async function HistoryPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const context = await requireSessionContext();
  const store = context.activeStore!;
  const canViewHistory = canAccessHistory(context.membership, store);
  const params = await searchParams;

  if (!canViewHistory) {
    redirect("/forbidden?reason=history");
  }

  const closings = await getClosingsForStore({
    storeId: store.id,
    from: params.from,
    to: params.to
  });

  return (
    <div className="space-y-4">
      <OfflineHydrator stores={[store]} closings={closings} />
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Closing History</h2>
        <Badge label={context.membership?.role ?? "STAFF"} />
      </header>

      <form className="surface grid gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="field-label">From</label>
          <input type="date" name="from" className="field" defaultValue={params.from} />
        </div>
        <div>
          <label className="field-label">To</label>
          <input type="date" name="to" className="field" defaultValue={params.to} />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/10"
          >
            Filter
          </button>
        </div>
      </form>

      <section className="surface overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/70">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">True Revenue</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {closings.map((closing) => (
              <tr key={closing.id} className="border-t border-white/10">
                <td className="px-4 py-3">{formatDate(closing.business_date)}</td>
                <td className="px-4 py-3">
                  <Badge
                    label={closing.status}
                    variant={closing.status === "DRAFT" ? "warn" : "success"}
                  />
                </td>
                <td className="px-4 py-3 font-semibold">
                  {formatCurrency(closing.gross_collected)}
                </td>
                <td className="px-4 py-3">{formatCurrency(closing.true_revenue)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/closing/${closing.id}`}
                    className="text-xs font-semibold text-white/80 underline-offset-4 hover:underline"
                  >
                    {context.membership?.role === "ADMIN" ? "Open / Edit" : "Open"}
                  </Link>
                </td>
              </tr>
            ))}
            {closings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/60">
                  No closings in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
