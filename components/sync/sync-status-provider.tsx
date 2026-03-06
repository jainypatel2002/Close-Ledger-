"use client";

import { ReactNode, useEffect } from "react";
import { useSyncStore } from "@/lib/stores/sync-store";
import { listPendingMutations, syncNow } from "@/lib/offline/sync";

const refreshQueueCounts = async () => {
  const queue = await listPendingMutations();
  const failed = queue.filter((item) => item.status === "FAILED").length;
  return { pending: queue.length, failed };
};

export const SyncStatusProvider = ({ children }: { children: ReactNode }) => {
  const setOnline = useSyncStore((state) => state.setOnline);
  const setCounts = useSyncStore((state) => state.setCounts);
  const setSyncing = useSyncStore((state) => state.setSyncing);
  const setLastSyncedAt = useSyncStore((state) => state.setLastSyncedAt);

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true);
      setSyncing(true);
      const result = await syncNow();
      setSyncing(false);
      if (!result.skippedOffline) {
        setLastSyncedAt(new Date().toISOString());
      }
      const counts = await refreshQueueCounts();
      setCounts(counts.pending, counts.failed);
    };

    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = window.setInterval(async () => {
      const counts = await refreshQueueCounts();
      setCounts(counts.pending, counts.failed);
    }, 4000);

    void (async () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      const counts = await refreshQueueCounts();
      setCounts(counts.pending, counts.failed);
      if (isOnline) {
        setSyncing(true);
        await syncNow();
        setSyncing(false);
        const after = await refreshQueueCounts();
        setCounts(after.pending, after.failed);
      }
    })();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [setCounts, setLastSyncedAt, setOnline, setSyncing]);

  return <>{children}</>;
};
