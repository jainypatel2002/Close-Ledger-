"use client";

import { offlineDb } from "@/lib/offline/db";
import { SyncMutation } from "@/lib/types";

export const createMutation = (
  mutation: Omit<
    SyncMutation,
    "id" | "status" | "attempts" | "error_message" | "created_at" | "updated_at"
  >
): SyncMutation => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    status: "PENDING",
    attempts: 0,
    error_message: null,
    created_at: now,
    updated_at: now,
    ...mutation
  };
};

export const enqueueMutation = async (
  mutation: Omit<
    SyncMutation,
    "id" | "status" | "attempts" | "error_message" | "created_at" | "updated_at"
  >
) => {
  const record = createMutation(mutation);
  await offlineDb.mutations.put(record);
  return record;
};

export const listPendingMutations = async () =>
  offlineDb.mutations.where("status").anyOf(["PENDING", "FAILED"]).toArray();

export const syncNow = async () => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0, skippedOffline: true };
  }

  const queue = await listPendingMutations();
  let synced = 0;
  let failed = 0;

  for (const mutation of queue) {
    await offlineDb.mutations.update(mutation.id, {
      status: "PROCESSING",
      attempts: mutation.attempts + 1,
      updated_at: new Date().toISOString(),
      error_message: null
    });

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutation })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Sync failed.");
      }

      await offlineDb.mutations.delete(mutation.id);
      synced += 1;
    } catch (error) {
      failed += 1;
      await offlineDb.mutations.update(mutation.id, {
        status: "FAILED",
        error_message:
          error instanceof Error ? error.message : "This mutation could not be synced.",
        updated_at: new Date().toISOString()
      });
    }
  }

  return { synced, failed, skippedOffline: false };
};
