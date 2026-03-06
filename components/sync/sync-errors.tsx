"use client";

import { useEffect, useState } from "react";
import { offlineDb } from "@/lib/offline/db";

export const SyncErrors = () => {
  const [errors, setErrors] = useState<Array<{ id: string; error_message: string | null }>>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const failed = await offlineDb.mutations
        .where("status")
        .equals("FAILED")
        .reverse()
        .sortBy("updated_at");
      if (!active) {
        return;
      }
      setErrors(
        failed.slice(0, 5).map((item) => ({
          id: item.id,
          error_message: item.error_message
        }))
      );
    };
    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (errors.length === 0) {
    return null;
  }

  return (
    <section className="surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
        Sync Failures
      </h3>
      <ul className="mt-2 space-y-2 text-sm">
        {errors.map((error) => (
          <li key={error.id} className="rounded-lg border border-red-400/30 bg-red-500/10 p-2">
            {error.error_message ?? "Unknown sync failure."}
          </li>
        ))}
      </ul>
    </section>
  );
};
