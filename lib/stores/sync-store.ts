"use client";

import { create } from "zustand";

interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  setOnline: (online: boolean) => void;
  setCounts: (pendingCount: number, failedCount: number) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncedAt: (date: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  // Keep first render deterministic across SSR and client hydration.
  online: true,
  syncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  setOnline: (online) => set({ online }),
  setCounts: (pendingCount, failedCount) => set({ pendingCount, failedCount }),
  setSyncing: (syncing) => set({ syncing }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt })
}));
