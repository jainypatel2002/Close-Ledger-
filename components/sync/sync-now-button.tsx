"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { syncNow } from "@/lib/offline/sync";
import { useSyncStore } from "@/lib/stores/sync-store";

export const SyncNowButton = () => {
  const [pending, startTransition] = useTransition();
  const setSyncing = useSyncStore((state) => state.setSyncing);
  const setLastSyncedAt = useSyncStore((state) => state.setLastSyncedAt);
  const online = useSyncStore((state) => state.online);

  return (
    <button
      type="button"
      disabled={pending || !online}
      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          setSyncing(true);
          const result = await syncNow();
          setSyncing(false);
          if (result.skippedOffline) {
            toast.info("You are offline. Sync will resume automatically.");
            return;
          }
          setLastSyncedAt(new Date().toISOString());
          if (result.failed > 0) {
            toast.error(`${result.failed} mutation(s) failed to sync.`);
            return;
          }
          toast.success(result.synced > 0 ? "Synced successfully." : "Already up to date.");
        })
      }
    >
      {pending ? "Syncing..." : "Sync now"}
    </button>
  );
};
