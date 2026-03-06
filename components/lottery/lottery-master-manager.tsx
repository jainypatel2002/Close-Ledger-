"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DepthButton } from "@/components/ui/depth-button";
import { LotteryMasterEntry } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { offlineDb } from "@/lib/offline/db";
import { enqueueMutation } from "@/lib/offline/sync";

interface LotteryMasterManagerProps {
  storeId: string;
  initialEntries: LotteryMasterEntry[];
}

interface FormState {
  id?: string;
  display_number: number;
  name: string;
  ticket_price: number;
  default_bundle_size: number;
  is_active: boolean;
  is_locked: boolean;
  notes: string;
}

const emptyForm: FormState = {
  display_number: 1,
  name: "",
  ticket_price: 0,
  default_bundle_size: 100,
  is_active: true,
  is_locked: false,
  notes: ""
};

const sortEntries = (entries: LotteryMasterEntry[]) =>
  [...entries].sort((a, b) => a.display_number - b.display_number || a.name.localeCompare(b.name));

export const LotteryMasterManager = ({ storeId, initialEntries }: LotteryMasterManagerProps) => {
  const [entries, setEntries] = useState<LotteryMasterEntry[]>(sortEntries(initialEntries));
  const [form, setForm] = useState<FormState>(() => {
    const nextDisplay = (sortEntries(initialEntries).at(-1)?.display_number ?? 0) + 1;
    return { ...emptyForm, display_number: Math.max(1, nextDisplay) };
  });
  const [pending, startTransition] = useTransition();

  const previewRows = useMemo(() => sortEntries(entries), [entries]);

  const resetForm = () => {
    const nextDisplay = (sortEntries(entries).at(-1)?.display_number ?? 0) + 1;
    setForm({ ...emptyForm, display_number: Math.max(1, nextDisplay) });
  };

  const persistOfflineAndQueue = async (payload: LotteryMasterEntry) => {
    await offlineDb.lotteryMasterEntries.put({ ...payload, _dirty: true });
    await enqueueMutation({
      type: "UPSERT_LOTTERY_MASTER",
      store_id: payload.store_id,
      entity_id: payload.id,
      payload: payload as unknown as Record<string, unknown>
    });
  };

  const submit = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Lottery name is required.");
      return;
    }
    if (form.ticket_price < 0) {
      toast.error("Ticket price must be 0 or more.");
      return;
    }
    if (form.default_bundle_size <= 0) {
      toast.error("Bundle size must be greater than 0.");
      return;
    }

    const conflict = entries.find(
      (entry) =>
        entry.display_number === form.display_number &&
        (form.id ? entry.id !== form.id : true)
    );
    if (conflict) {
      toast.error("Display number already exists for this store.");
      return;
    }

    startTransition(async () => {
      const id = form.id ?? crypto.randomUUID();
      const payload: LotteryMasterEntry = {
        id,
        store_id: storeId,
        display_number: form.display_number,
        name: trimmedName,
        ticket_price: Number(form.ticket_price),
        default_bundle_size: Number(form.default_bundle_size),
        is_active: Boolean(form.is_active),
        is_locked: Boolean(form.is_locked),
        notes: form.notes.trim() || null,
        created_by_app_user_id: null,
        updated_by_app_user_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        const response = await fetch(
          form.id ? `/api/lottery-master/${form.id}` : "/api/lottery-master",
          {
            method: form.id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              form.id
                ? {
                    display_number: payload.display_number,
                    name: payload.name,
                    ticket_price: payload.ticket_price,
                    default_bundle_size: payload.default_bundle_size,
                    is_active: payload.is_active,
                    is_locked: payload.is_locked,
                    notes: payload.notes
                  }
                : {
                    store_id: payload.store_id,
                    display_number: payload.display_number,
                    name: payload.name,
                    ticket_price: payload.ticket_price,
                    default_bundle_size: payload.default_bundle_size,
                    is_active: payload.is_active,
                    is_locked: payload.is_locked,
                    notes: payload.notes
                  }
            )
          }
        );
        const result = (await response.json().catch(() => ({}))) as {
          data?: LotteryMasterEntry;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Unable to save lottery entry.");
        }

        const saved = result.data ?? payload;
        setEntries((current) =>
          sortEntries([
            ...current.filter((entry) => entry.id !== saved.id),
            {
              ...saved,
              store_id: storeId
            }
          ])
        );
        await offlineDb.lotteryMasterEntries.put({ ...saved, store_id: storeId, _dirty: false });
        toast.success(form.id ? "Lottery entry updated." : "Lottery entry created.");
        resetForm();
      } catch (error) {
        await persistOfflineAndQueue(payload);
        setEntries((current) =>
          sortEntries([...current.filter((entry) => entry.id !== payload.id), payload])
        );
        toast.info(
          error instanceof Error
            ? `${error.message} Saved locally and queued for sync.`
            : "Saved locally and queued for sync."
        );
        resetForm();
      }
    });
  };

  const quickUpdate = (entry: LotteryMasterEntry, patch: Partial<LotteryMasterEntry>) => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/lottery-master/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        const result = (await response.json().catch(() => ({}))) as {
          data?: LotteryMasterEntry;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Update failed.");
        }
        const saved = result.data ?? { ...entry, ...patch };
        setEntries((current) =>
          sortEntries([...current.filter((item) => item.id !== saved.id), saved])
        );
        await offlineDb.lotteryMasterEntries.put({ ...saved, _dirty: false });
      } catch {
        const local = {
          ...entry,
          ...patch,
          updated_at: new Date().toISOString()
        };
        setEntries((current) =>
          sortEntries([...current.filter((item) => item.id !== local.id), local])
        );
        await persistOfflineAndQueue(local);
      }
    });
  };

  const deleteEntry = (entry: LotteryMasterEntry) => {
    const ok = window.confirm(`Delete ${entry.name}?`);
    if (!ok) {
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch(`/api/lottery-master/${entry.id}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(result.error || "Delete failed.");
        }
        setEntries((current) => current.filter((item) => item.id !== entry.id));
        await offlineDb.lotteryMasterEntries.delete(entry.id);
        toast.success("Lottery entry deleted.");
      } catch (error) {
        await enqueueMutation({
          type: "DELETE_LOTTERY_MASTER",
          store_id: storeId,
          entity_id: entry.id,
          payload: {
            id: entry.id,
            store_id: storeId
          }
        });
        setEntries((current) => current.filter((item) => item.id !== entry.id));
        toast.info(
          error instanceof Error
            ? `${error.message} Deletion queued for sync.`
            : "Deletion queued for sync."
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Lottery Master Setup
        </h3>
        <p className="mt-1 text-xs text-white/65">
          Locked entries are read-only in daily closing identity/price fields. Staff only enters
          start/end numbers and payouts.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div>
            <label className="field-label">Display Number</label>
            <input
              className="field"
              type="number"
              min={1}
              value={form.display_number}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  display_number: Number(event.target.value || 1)
                }))
              }
            />
          </div>
          <div>
            <label className="field-label">Lottery Name</label>
            <input
              className="field"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <label className="field-label">Ticket Price</label>
            <input
              className="field"
              type="number"
              step="0.01"
              min={0}
              value={form.ticket_price}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ticket_price: Number(event.target.value || 0)
                }))
              }
            />
          </div>
          <div>
            <label className="field-label">Default Bundle Size</label>
            <input
              className="field"
              type="number"
              min={1}
              value={form.default_bundle_size}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  default_bundle_size: Number(event.target.value || 100)
                }))
              }
            />
          </div>
          <label className="mt-5 inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                setForm((current) => ({ ...current, is_active: event.target.checked }))
              }
            />
            Active
          </label>
          <label className="mt-5 inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={form.is_locked}
              onChange={(event) =>
                setForm((current) => ({ ...current, is_locked: event.target.checked }))
              }
            />
            Locked
          </label>
        </div>
        <div className="mt-2">
          <label className="field-label">Notes</label>
          <textarea
            className="field"
            rows={3}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <DepthButton type="button" disabled={pending} onClick={submit}>
            {form.id ? "Update Lottery" : "Add Lottery"}
          </DepthButton>
          {form.id && (
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
              onClick={resetForm}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </section>

      <section className="surface overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/70">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Bundle</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Lock</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((entry) => (
              <tr key={entry.id} className="border-t border-white/10">
                <td className="px-3 py-2 font-semibold">{entry.display_number}</td>
                <td className="px-3 py-2">{entry.name}</td>
                <td className="px-3 py-2">{formatCurrency(entry.ticket_price)}</td>
                <td className="px-3 py-2">{entry.default_bundle_size}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      entry.is_active
                        ? "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                        : "border border-white/25 bg-white/10 text-white/70"
                    }`}
                  >
                    {entry.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">{entry.is_locked ? "Locked" : "Unlocked"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() =>
                        setForm({
                          id: entry.id,
                          display_number: entry.display_number,
                          name: entry.name,
                          ticket_price: entry.ticket_price,
                          default_bundle_size: entry.default_bundle_size,
                          is_active: entry.is_active,
                          is_locked: entry.is_locked,
                          notes: entry.notes ?? ""
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() =>
                        void quickUpdate(entry, {
                          is_locked: !entry.is_locked
                        })
                      }
                    >
                      {entry.is_locked ? "Unlock" : "Lock"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() =>
                        void quickUpdate(entry, {
                          is_active: !entry.is_active
                        })
                      }
                    >
                      {entry.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-300/40 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
                      onClick={() => deleteEntry(entry)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {previewRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-white/60">
                  No lottery entries configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="surface p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Closing Preview
        </h3>
        <div className="mt-2 space-y-2">
          {previewRows
            .filter((entry) => entry.is_active)
            .map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/80"
              >
                <span className="mr-2 font-semibold">{entry.display_number}.</span>
                {entry.name} · {formatCurrency(entry.ticket_price)}
                {entry.is_locked ? " · locked in closing" : " · editable by admin setup"}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
};
