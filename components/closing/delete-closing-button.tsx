"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

export const DeleteClosingButton = ({ closingId }: { closingId: string }) => {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-lg border border-red-400/50 bg-red-600/20 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-600/30 disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        const ok = window.confirm("Delete this closing? This cannot be undone.");
        if (!ok) {
          return;
        }
        startTransition(async () => {
          const response = await fetch(`/api/closings/${closingId}`, { method: "DELETE" });
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            toast.error(body.error ?? "Delete failed.");
            return;
          }
          toast.success("Closing deleted.");
          router.replace("/history");
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting..." : "Delete Closing"}
    </button>
  );
};
