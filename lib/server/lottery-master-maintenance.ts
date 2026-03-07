import { normalizeLotteryName } from "@/lib/lottery/master-rules";

export type LotteryMaintenanceMode = "clean_duplicates" | "reset_setup";

export interface LotteryMaintenanceEntry {
  id: string;
  store_id: string;
  display_number: number;
  name: string;
  is_active: boolean;
  is_archived?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LotteryMaintenanceAction {
  entry_id: string;
  store_id: string;
  action: "DELETE" | "ARCHIVE";
  reason:
    | "invalid_entry"
    | "duplicate_display_number"
    | "duplicate_name"
    | "reset_setup"
    | "archived_state_fix";
  reference_count: number;
}

export interface LotteryMaintenancePlan {
  mode: LotteryMaintenanceMode;
  scanned_count: number;
  duplicate_groups: number;
  invalid_rows: number;
  actions: LotteryMaintenanceAction[];
  kept_ids: string[];
}

const getReferenceCount = (referenceCounts: Record<string, number>, entryId: string) =>
  Math.max(0, Number(referenceCounts[entryId] ?? 0));

const sortByCanonicalPriority = (
  rows: LotteryMaintenanceEntry[],
  referenceCounts: Record<string, number>
) =>
  [...rows].sort((a, b) => {
    const aRefs = getReferenceCount(referenceCounts, a.id);
    const bRefs = getReferenceCount(referenceCounts, b.id);
    if (aRefs !== bRefs) {
      return bRefs - aRefs;
    }
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }
    return a.id.localeCompare(b.id);
  });

const addAction = ({
  actionMap,
  action
}: {
  actionMap: Map<string, LotteryMaintenanceAction>;
  action: LotteryMaintenanceAction;
}) => {
  const existing = actionMap.get(action.entry_id);
  if (!existing) {
    actionMap.set(action.entry_id, action);
    return;
  }

  // ARCHIVE is always safer than DELETE if multiple rules apply.
  if (existing.action === "DELETE" && action.action === "ARCHIVE") {
    actionMap.set(action.entry_id, action);
  }
};

const buildActionForEntry = ({
  entry,
  referenceCounts,
  reason
}: {
  entry: LotteryMaintenanceEntry;
  referenceCounts: Record<string, number>;
  reason: LotteryMaintenanceAction["reason"];
}): LotteryMaintenanceAction => {
  const referenceCount = getReferenceCount(referenceCounts, entry.id);
  return {
    entry_id: entry.id,
    store_id: entry.store_id,
    action: referenceCount > 0 ? "ARCHIVE" : "DELETE",
    reason,
    reference_count: referenceCount
  };
};

export const buildLotteryMaintenancePlan = ({
  entries,
  referenceCounts,
  mode
}: {
  entries: LotteryMaintenanceEntry[];
  referenceCounts: Record<string, number>;
  mode: LotteryMaintenanceMode;
}): LotteryMaintenancePlan => {
  const activeRows = entries.filter((entry) => !Boolean(entry.is_archived));
  const actionMap = new Map<string, LotteryMaintenanceAction>();
  const keptIds = new Set(activeRows.map((entry) => entry.id));
  let duplicateGroups = 0;
  let invalidRows = 0;

  if (mode === "reset_setup") {
    activeRows.forEach((entry) => {
      addAction({
        actionMap,
        action: buildActionForEntry({
          entry,
          referenceCounts,
          reason: "reset_setup"
        })
      });
      keptIds.delete(entry.id);
    });

    return {
      mode,
      scanned_count: entries.length,
      duplicate_groups: 0,
      invalid_rows: 0,
      actions: [...actionMap.values()],
      kept_ids: [...keptIds]
    };
  }

  activeRows.forEach((entry) => {
    const normalizedName = normalizeLotteryName(entry.name);
    const invalid = normalizedName.length === 0 || Number(entry.display_number) <= 0;
    if (!invalid) {
      return;
    }
    invalidRows += 1;
    addAction({
      actionMap,
      action: buildActionForEntry({
        entry,
        referenceCounts,
        reason: "invalid_entry"
      })
    });
    keptIds.delete(entry.id);
  });

  const duplicateByDisplay = new Map<number, LotteryMaintenanceEntry[]>();
  const duplicateByName = new Map<string, LotteryMaintenanceEntry[]>();

  activeRows.forEach((entry) => {
    const listByDisplay = duplicateByDisplay.get(entry.display_number) ?? [];
    listByDisplay.push(entry);
    duplicateByDisplay.set(entry.display_number, listByDisplay);

    const normalizedName = normalizeLotteryName(entry.name);
    if (normalizedName) {
      const listByName = duplicateByName.get(normalizedName) ?? [];
      listByName.push(entry);
      duplicateByName.set(normalizedName, listByName);
    }
  });

  duplicateByDisplay.forEach((rows) => {
    if (rows.length <= 1) {
      return;
    }
    duplicateGroups += 1;
    const canonical = sortByCanonicalPriority(rows, referenceCounts)[0];
    rows
      .filter((row) => row.id !== canonical.id)
      .forEach((row) => {
        addAction({
          actionMap,
          action: buildActionForEntry({
            entry: row,
            referenceCounts,
            reason: "duplicate_display_number"
          })
        });
        keptIds.delete(row.id);
      });
  });

  duplicateByName.forEach((rows) => {
    if (rows.length <= 1) {
      return;
    }
    duplicateGroups += 1;
    const canonical = sortByCanonicalPriority(rows, referenceCounts)[0];
    rows
      .filter((row) => row.id !== canonical.id)
      .forEach((row) => {
        addAction({
          actionMap,
          action: buildActionForEntry({
            entry: row,
            referenceCounts,
            reason: "duplicate_name"
          })
        });
        keptIds.delete(row.id);
      });
  });

  return {
    mode,
    scanned_count: entries.length,
    duplicate_groups: duplicateGroups,
    invalid_rows: invalidRows,
    actions: [...actionMap.values()],
    kept_ids: [...keptIds]
  };
};
