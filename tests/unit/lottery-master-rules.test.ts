import { describe, expect, it } from "vitest";
import {
  findUsableLotteryConflicts,
  normalizeLotteryName,
  splitLotteryEntriesByStatus
} from "@/lib/lottery/master-rules";
import { LotteryMasterEntry } from "@/lib/types";

const baseEntry = (overrides: Partial<LotteryMasterEntry>): LotteryMasterEntry => ({
  id: crypto.randomUUID(),
  store_id: "d6e9a743-00f5-4a2f-879f-32d7c28a8f41",
  display_number: 1,
  name: "Cashword",
  ticket_price: 2,
  default_bundle_size: 100,
  is_active: true,
  is_archived: false,
  archived_at: null,
  archived_by_app_user_id: null,
  is_locked: true,
  notes: null,
  created_by_app_user_id: null,
  updated_by_app_user_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

describe("lottery master rules", () => {
  it("normalizes names for case-insensitive uniqueness", () => {
    expect(normalizeLotteryName("  Cash   Word  ")).toBe("cash word");
  });

  it("only active non-archived entries block uniqueness", () => {
    const active = baseEntry({ display_number: 1, name: "Cashword" });
    const inactive = baseEntry({ display_number: 1, name: "Cashword", is_active: false });
    const archived = baseEntry({ display_number: 1, name: "Cashword", is_archived: true });

    const conflicts = findUsableLotteryConflicts([inactive, archived], {
      displayNumber: 1,
      name: "Cashword"
    });
    expect(conflicts.numberConflict).toBeNull();
    expect(conflicts.nameConflict).toBeNull();

    const activeConflict = findUsableLotteryConflicts([active, inactive, archived], {
      displayNumber: 1,
      name: "cashword"
    });
    expect(activeConflict.numberConflict?.id).toBe(active.id);
    expect(activeConflict.nameConflict?.id).toBe(active.id);
  });

  it("splits entries into active/inactive/archived sets", () => {
    const entries = [
      baseEntry({ id: "a1", is_active: true, is_archived: false }),
      baseEntry({ id: "i1", is_active: false, is_archived: false }),
      baseEntry({ id: "r1", is_active: false, is_archived: true })
    ];

    const split = splitLotteryEntriesByStatus(entries);
    expect(split.active.map((entry) => entry.id)).toEqual(["a1"]);
    expect(split.inactive.map((entry) => entry.id)).toEqual(["i1"]);
    expect(split.archived.map((entry) => entry.id)).toEqual(["r1"]);
  });
});
