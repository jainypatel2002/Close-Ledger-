import { describe, expect, it } from "vitest";
import {
  buildLotteryMaintenancePlan,
  LotteryMaintenanceEntry
} from "@/lib/server/lottery-master-maintenance";

const makeEntry = (overrides: Partial<LotteryMaintenanceEntry>): LotteryMaintenanceEntry => ({
  id: crypto.randomUUID(),
  store_id: "5c95ec83-8a88-4738-9760-84f5578c9018",
  display_number: 1,
  name: "Cashword",
  is_active: true,
  is_archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

describe("lottery master maintenance planner", () => {
  it("detects duplicates and keeps referenced canonical rows", () => {
    const keepReferenced = makeEntry({ id: "keep", display_number: 10, name: "Cashword" });
    const duplicateUnreferenced = makeEntry({
      id: "drop",
      display_number: 10,
      name: "cashword",
      is_active: false
    });
    const unique = makeEntry({ id: "unique", display_number: 11, name: "Lucky 7" });

    const plan = buildLotteryMaintenancePlan({
      entries: [keepReferenced, duplicateUnreferenced, unique],
      referenceCounts: {
        keep: 4,
        drop: 0,
        unique: 0
      },
      mode: "clean_duplicates"
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      entry_id: "drop",
      action: "DELETE"
    });
    expect(plan.kept_ids).toEqual(expect.arrayContaining(["keep", "unique"]));
  });

  it("archives referenced rows and deletes unreferenced rows during reset", () => {
    const referenced = makeEntry({ id: "referenced", display_number: 1, name: "One" });
    const unreferenced = makeEntry({ id: "unreferenced", display_number: 2, name: "Two" });
    const alreadyArchived = makeEntry({
      id: "archived",
      display_number: 3,
      name: "Old",
      is_archived: true,
      is_active: false
    });

    const plan = buildLotteryMaintenancePlan({
      entries: [referenced, unreferenced, alreadyArchived],
      referenceCounts: {
        referenced: 2,
        unreferenced: 0
      },
      mode: "reset_setup"
    });

    expect(plan.scanned_count).toBe(3);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entry_id: "referenced", action: "ARCHIVE" }),
        expect.objectContaining({ entry_id: "unreferenced", action: "DELETE" })
      ])
    );
    expect(plan.actions.find((item) => item.entry_id === "archived")).toBeUndefined();
  });
});
