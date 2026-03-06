"use client";

import { useSyncStore } from "@/lib/stores/sync-store";
import { cn } from "@/lib/utils";

export const SyncBadge = () => {
  const { online, pendingCount, failedCount, syncing } = useSyncStore();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        online ? "border-green-400/40 bg-green-400/20 text-green-100" : "border-yellow-400/40 bg-yellow-400/20 text-yellow-100"
      )}
    >
      {syncing
        ? "Syncing..."
        : online
          ? failedCount > 0
            ? `Online · ${failedCount} failed`
            : pendingCount > 0
              ? `Online · ${pendingCount} pending`
              : "Online · synced"
          : "Offline"}
    </span>
  );
};
