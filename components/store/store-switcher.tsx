"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Store } from "@/lib/types";
import { setActiveStore } from "@/app/actions/session";

interface StoreSwitcherProps {
  stores: Store[];
  activeStoreId: string | null;
}

export const StoreSwitcher = ({ stores, activeStoreId }: StoreSwitcherProps) => {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <label className="inline-flex items-center gap-2 text-xs text-white/70">
      <span className="hidden sm:inline">Store</span>
      <select
        className="field h-9 min-w-44 py-0 text-sm"
        value={activeStoreId ?? ""}
        disabled={pending || stores.length === 0}
        onChange={(event) => {
          const nextStoreId = event.target.value;
          startTransition(async () => {
            await setActiveStore(nextStoreId);
            router.refresh();
          });
        }}
      >
        {stores.length === 0 && <option value="">No store yet</option>}
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.store_name}
          </option>
        ))}
      </select>
    </label>
  );
};
