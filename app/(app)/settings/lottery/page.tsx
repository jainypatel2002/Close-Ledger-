import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLotteryMasterEntriesForStore } from "@/lib/data/lottery-master";
import { LotteryMasterManager } from "@/components/lottery/lottery-master-manager";
import { OfflineHydrator } from "@/components/sync/offline-hydrator";

export default async function LotterySetupPage() {
  const context = await requireAdmin();
  const store = context.activeStore!;
  const entries = await getLotteryMasterEntriesForStore({
    storeId: store.id,
    onlyActive: false
  });

  return (
    <div className="space-y-4">
      <OfflineHydrator stores={[store]} lotteryMasterEntries={entries} />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Lottery Setup</h2>
          <p className="text-sm text-white/70">
            Store-level lottery master catalog controls daily closing lottery rows.
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
        >
          Back To Settings
        </Link>
      </header>

      <LotteryMasterManager storeId={store.id} initialEntries={entries} />
    </div>
  );
}
