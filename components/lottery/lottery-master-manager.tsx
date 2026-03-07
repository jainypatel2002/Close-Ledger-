"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DepthButton } from "@/components/ui/depth-button";
import { LotteryMasterEntry } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { offlineDb } from "@/lib/offline/db";
import { enqueueMutation } from "@/lib/offline/sync";
import {
  createLotteryMasterFormState,
  LotteryMasterFormState,
  parseLotteryMasterFormState
} from "@/lib/lottery/master-form";
import {
  findUsableLotteryConflicts,
  isLotteryArchived,
  splitLotteryEntriesByStatus
} from "@/lib/lottery/master-rules";

interface LotteryMasterManagerProps {
  storeId: string;
  initialEntries: LotteryMasterEntry[];
}

type LotteryFilter = "active" | "inactive" | "archived" | "all";
type MaintenanceAction = "clean_duplicates" | "reset_setup";

interface MaintenanceSummary {
  action: MaintenanceAction;
  scanned_count: number;
  duplicate_groups: number;
  invalid_rows: number;
  archived_count: number;
  deleted_count: number;
}

const sortEntries = (entries: LotteryMasterEntry[]) =>
  [...entries].sort((a, b) => a.display_number - b.display_number || a.name.localeCompare(b.name));

const normalizeEntry = (entry: LotteryMasterEntry): LotteryMasterEntry => ({
  ...entry,
  is_archived: Boolean(entry.is_archived),
  archived_at: entry.archived_at ?? null,
  archived_by_app_user_id: entry.archived_by_app_user_id ?? null
});

const syncOfflineLotteryCache = async ({
  storeId,
  nextEntries,
  preserveDirty = true
}: {
  storeId: string;
  nextEntries: LotteryMasterEntry[];
  preserveDirty?: boolean;
}) => {
  const normalizedNext = nextEntries.map((entry) => normalizeEntry(entry));
  const nextById = new Map(normalizedNext.map((entry) => [entry.id, entry]));
  const cached = await offlineDb.lotteryMasterEntries.where("store_id").equals(storeId).toArray();

  for (const localEntry of cached) {
    if (preserveDirty && localEntry._dirty) {
      continue;
    }
    if (!nextById.has(localEntry.id)) {
      await offlineDb.lotteryMasterEntries.delete(localEntry.id);
    }
  }

  for (const entry of normalizedNext) {
    const existing = await offlineDb.lotteryMasterEntries.get(entry.id);
    if (preserveDirty && existing?._dirty) {
      continue;
    }
    await offlineDb.lotteryMasterEntries.put({ ...entry, _dirty: false });
  }
};

const clearLotteryMutationsForStore = async (storeId: string) => {
  const mutations = await offlineDb.mutations.where("store_id").equals(storeId).toArray();
  for (const mutation of mutations) {
    if (
      mutation.type === "UPSERT_LOTTERY_MASTER" ||
      mutation.type === "DELETE_LOTTERY_MASTER"
    ) {
      await offlineDb.mutations.delete(mutation.id);
    }
  }
};

export const LotteryMasterManager = ({ storeId, initialEntries }: LotteryMasterManagerProps) => {
  const [entries, setEntries] = useState<LotteryMasterEntry[]>(
    sortEntries(initialEntries.map((entry) => normalizeEntry(entry)))
  );
  const [filter, setFilter] = useState<LotteryFilter>("active");
  const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceSummary | null>(null);
  const getNextDisplayNumber = (sourceEntries: LotteryMasterEntry[]) =>
    Math.max(1, (sortEntries(sourceEntries).at(-1)?.display_number ?? 0) + 1);
  const [form, setForm] = useState<LotteryMasterFormState>(() =>
    createLotteryMasterFormState({
      nextDisplayNumber: getNextDisplayNumber(initialEntries),
      defaultBundleSize: 100
    })
  );
  const [isFormOpen, setIsFormOpen] = useState(initialEntries.length === 0);
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(() => sortEntries(entries), [entries]);
  const groups = useMemo(() => splitLotteryEntriesByStatus(sorted), [sorted]);
  const previewRows = useMemo(() => {
    if (filter === "active") {
      return groups.active;
    }
    if (filter === "inactive") {
      return groups.inactive;
    }
    if (filter === "archived") {
      return groups.archived;
    }
    return groups.all;
  }, [filter, groups.active, groups.all, groups.archived, groups.inactive]);
  const activePreviewRows = groups.active;

  const applyEntries = async ({
    nextEntries,
    preserveDirty = true,
    clearLotteryMutations = false
  }: {
    nextEntries: LotteryMasterEntry[];
    preserveDirty?: boolean;
    clearLotteryMutations?: boolean;
  }) => {
    const normalized = sortEntries(nextEntries.map((entry) => normalizeEntry(entry)));
    setEntries(normalized);
    await syncOfflineLotteryCache({
      storeId,
      nextEntries: normalized,
      preserveDirty
    });
    if (clearLotteryMutations) {
      await clearLotteryMutationsForStore(storeId);
    }
  };

  const loadEntriesFromServer = async () => {
    const response = await fetch(`/api/lottery-master?storeId=${storeId}&includeArchived=1`, {
      cache: "no-store"
    });
    const result = (await response.json().catch(() => ({}))) as {
      data?: LotteryMasterEntry[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "Unable to refresh lottery entries.");
    }
    return (result.data ?? []).map((entry) => normalizeEntry(entry));
  };

  const resetForm = (open = false) => {
    setForm(
      createLotteryMasterFormState({
        nextDisplayNumber: getNextDisplayNumber(entries),
        defaultBundleSize: 100
      })
    );
    setIsFormOpen(open);
  };

  const openCreateForm = () => {
    resetForm(true);
  };

  const startEdit = (entry: LotteryMasterEntry) => {
    setForm(
      createLotteryMasterFormState({
        entry,
        nextDisplayNumber: getNextDisplayNumber(entries),
        defaultBundleSize: 100
      })
    );
    setIsFormOpen(true);
  };

  const persistOfflineAndQueue = async (payload: LotteryMasterEntry) => {
    const normalized = normalizeEntry(payload);
    await offlineDb.lotteryMasterEntries.put({ ...normalized, _dirty: true });
    await enqueueMutation({
      type: "UPSERT_LOTTERY_MASTER",
      store_id: normalized.store_id,
      entity_id: normalized.id,
      payload: normalized as unknown as Record<string, unknown>
    });
  };

  const submit = () => {
    const parsed = parseLotteryMasterFormState(form);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const values = parsed.data;

    if (values.is_active) {
      const { numberConflict, nameConflict } = findUsableLotteryConflicts(entries, {
        displayNumber: values.display_number,
        name: values.name,
        excludeId: form.id
      });
      if (numberConflict) {
        toast.error("Lottery number already exists among active lotteries for this store.");
        return;
      }
      if (nameConflict) {
        toast.error("Lottery name already exists among active lotteries for this store.");
        return;
      }
    }

    startTransition(async () => {
      const isEditing = Boolean(form.id);
      const id = form.id ?? crypto.randomUUID();
      const payload: LotteryMasterEntry = normalizeEntry({
        id,
        store_id: storeId,
        display_number: values.display_number,
        name: values.name,
        ticket_price: values.ticket_price,
        default_bundle_size: values.default_bundle_size,
        is_active: values.is_active,
        is_locked: values.is_locked,
        notes: values.notes,
        created_by_app_user_id: null,
        updated_by_app_user_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_archived: false,
        archived_at: null,
        archived_by_app_user_id: null
      });

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

        const saved = normalizeEntry(result.data ?? payload);
        const nextEntries = sortEntries([
          ...entries.filter((entry) => entry.id !== saved.id),
          {
            ...saved,
            store_id: storeId
          }
        ]);
        await applyEntries({ nextEntries, preserveDirty: true });
        toast.success(isEditing ? "Lottery entry updated." : "Lottery entry created.");
        resetForm(!isEditing);
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
        resetForm(!isEditing);
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
        const saved = normalizeEntry(result.data ?? { ...entry, ...patch });
        const nextEntries = sortEntries([
          ...entries.filter((item) => item.id !== saved.id),
          saved
        ]);
        await applyEntries({ nextEntries, preserveDirty: true });
      } catch {
        const local = normalizeEntry({
          ...entry,
          ...patch,
          updated_at: new Date().toISOString()
        });
        setEntries((current) =>
          sortEntries([...current.filter((item) => item.id !== local.id), local])
        );
        await persistOfflineAndQueue(local);
      }
    });
  };

  const deleteEntry = (entry: LotteryMasterEntry) => {
    const ok = window.confirm(
      `Delete ${entry.name}? Referenced historical lotteries will be archived instead of hard deleted.`
    );
    if (!ok) {
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch(`/api/lottery-master/${entry.id}`, {
          method: "DELETE"
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          action?: "deleted" | "archived";
          data?: LotteryMasterEntry;
        };
        if (!response.ok) {
          throw new Error(result.error || "Delete failed.");
        }

        if (result.action === "archived" && result.data) {
          const archived = normalizeEntry(result.data);
          const nextEntries = sortEntries([
            ...entries.filter((item) => item.id !== archived.id),
            archived
          ]);
          await applyEntries({ nextEntries, preserveDirty: true });
          toast.success("Lottery entry archived to protect historical closings.");
          return;
        }

        const nextEntries = entries.filter((item) => item.id !== entry.id);
        await applyEntries({ nextEntries, preserveDirty: true });
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

  const runMaintenance = (action: MaintenanceAction) => {
    const confirmMessage =
      action === "clean_duplicates"
        ? "Scan this store and clean hidden duplicate/problematic lottery setup entries?"
        : "Reset lottery setup for this store? Historical closings will stay intact, referenced entries will be archived.";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/lottery-master/maintenance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            action
          })
        });
        const result = (await response.json().catch(() => ({}))) as {
          data?: LotteryMasterEntry[];
          summary?: MaintenanceSummary;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Lottery maintenance failed.");
        }

        const nextEntries = result.data ?? (await loadEntriesFromServer());
        await applyEntries({
          nextEntries,
          preserveDirty: false,
          clearLotteryMutations: true
        });
        if (action === "reset_setup") {
          setFilter("active");
        }
        if (result.summary) {
          setMaintenanceSummary(result.summary);
          toast.success(
            action === "clean_duplicates"
              ? `Cleanup finished: ${result.summary.deleted_count} deleted, ${result.summary.archived_count} archived.`
              : `Lottery setup reset: ${result.summary.deleted_count} deleted, ${result.summary.archived_count} archived.`
          );
        } else {
          toast.success("Lottery maintenance completed.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Lottery maintenance failed.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Lottery Setup
            </h3>
            <p className="mt-1 text-xs text-white/65">
              Add and manage scratch ticket lotteries for this store. Active entries appear
              automatically in nightly closing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DepthButton type="button" disabled={pending} onClick={openCreateForm}>
              Add Lottery
            </DepthButton>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-60"
              onClick={() => runMaintenance("clean_duplicates")}
            >
              Clean Duplicate Lotteries
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
              onClick={() => runMaintenance("reset_setup")}
            >
              Reset Lottery Setup
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-emerald-300/40 bg-emerald-500/15 px-2 py-1 text-emerald-100">
            Active: {groups.active.length}
          </span>
          <span className="rounded border border-white/20 bg-white/10 px-2 py-1 text-white/80">
            Inactive: {groups.inactive.length}
          </span>
          <span className="rounded border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-amber-100">
            Archived: {groups.archived.length}
          </span>
        </div>
        {maintenanceSummary && (
          <p className="mt-2 text-xs text-white/70">
            Last maintenance: {maintenanceSummary.action} · scanned {maintenanceSummary.scanned_count}
            , duplicates {maintenanceSummary.duplicate_groups}, invalid {maintenanceSummary.invalid_rows}
            , archived {maintenanceSummary.archived_count}, deleted {maintenanceSummary.deleted_count}
          </p>
        )}
      </section>

      {isFormOpen && (
        <section className="surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              {form.id ? "Edit Lottery" : "Add Lottery"}
            </h3>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              onClick={() => resetForm(false)}
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-xs text-white/65">
            Locked entries keep lottery identity and amount read-only during closing.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div>
              <label className="field-label">Lottery Number</label>
              <input
                className="field"
                type="number"
                aria-label="Lottery Number"
                min={1}
                value={form.display_number}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    display_number: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Lottery Name</label>
              <input
                className="field"
                aria-label="Lottery Name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label">Amount</label>
              <input
                className="field"
                type="number"
                aria-label="Lottery Amount"
                step="0.01"
                min={0}
                value={form.ticket_price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ticket_price: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="field-label">Default Bundle Size</label>
              <input
                className="field"
                type="number"
                aria-label="Default Bundle Size"
                min={1}
                value={form.default_bundle_size}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    default_bundle_size: event.target.value
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
              aria-label="Lottery Notes"
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <DepthButton type="button" disabled={pending} onClick={submit}>
              {pending ? "Saving..." : form.id ? "Save Changes" : "Add Lottery"}
            </DepthButton>
            {form.id && (
              <button
                type="button"
                className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
                onClick={openCreateForm}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </section>
      )}

      <section className="surface p-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className={`rounded border px-3 py-1 ${
              filter === "active"
                ? "border-emerald-300/45 bg-emerald-500/20 text-emerald-100"
                : "border-white/20 text-white/80 hover:bg-white/10"
            }`}
            onClick={() => setFilter("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={`rounded border px-3 py-1 ${
              filter === "inactive"
                ? "border-white/35 bg-white/15 text-white"
                : "border-white/20 text-white/80 hover:bg-white/10"
            }`}
            onClick={() => setFilter("inactive")}
          >
            Inactive
          </button>
          <button
            type="button"
            className={`rounded border px-3 py-1 ${
              filter === "archived"
                ? "border-amber-300/45 bg-amber-500/20 text-amber-100"
                : "border-white/20 text-white/80 hover:bg-white/10"
            }`}
            onClick={() => setFilter("archived")}
          >
            Archived/Hidden
          </button>
          <button
            type="button"
            className={`rounded border px-3 py-1 ${
              filter === "all"
                ? "border-brand-crimson/45 bg-brand-crimson/20 text-white"
                : "border-white/20 text-white/80 hover:bg-white/10"
            }`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/70">
              <tr>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Lottery Name</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Bundle Size</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Lock Status</th>
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
                        isLotteryArchived(entry)
                          ? "border border-amber-300/40 bg-amber-500/20 text-amber-100"
                          : entry.is_active
                            ? "border border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                            : "border border-white/25 bg-white/10 text-white/70"
                      }`}
                    >
                      {isLotteryArchived(entry)
                        ? "Archived"
                        : entry.is_active
                          ? "Active"
                          : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        entry.is_locked
                          ? "border border-amber-300/40 bg-amber-500/20 text-amber-100"
                          : "border border-white/25 bg-white/10 text-white/70"
                      }`}
                    >
                      {entry.is_locked ? "Locked" : "Unlocked"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!isLotteryArchived(entry) && (
                        <>
                          <button
                            type="button"
                            className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                            onClick={() => startEdit(entry)}
                          >
                            Edit
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
                            className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                            onClick={() =>
                              void quickUpdate(entry, {
                                is_locked: !entry.is_locked
                              })
                            }
                          >
                            {entry.is_locked ? "Unlock" : "Lock"}
                          </button>
                        </>
                      )}
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
                  <td colSpan={7} className="px-3 py-8">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <p className="text-sm font-medium text-white/80">
                        No lotteries found for this filter.
                      </p>
                      <button
                        type="button"
                        className="rounded-lg border border-brand-crimson/40 bg-brand-crimson/15 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-crimson/25"
                        onClick={openCreateForm}
                      >
                        Add Lottery
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Closing Preview
        </h3>
        <div className="mt-2 space-y-2">
          {activePreviewRows.length === 0 && (
            <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
              No active lotteries configured yet.
            </p>
          )}
          {activePreviewRows.map((entry) => (
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
