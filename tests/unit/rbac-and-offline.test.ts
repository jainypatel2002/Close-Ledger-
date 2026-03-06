import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { saveClosingLocallyAndQueue } from "@/lib/closing/save";
import { offlineDb } from "@/lib/offline/db";
import {
  canAccessAdminRoute,
  canDeleteClosing,
  canModifyExistingClosing
} from "@/lib/server/closing-permissions";
import { Store } from "@/lib/types";

const storeFixture: Store = {
  id: "fe8b66ad-849b-4e6a-bf69-a0c05da20996",
  owner_id: "b2de1e81-9e58-4d0a-8886-26313a523ef2",
  store_name: "Main Street",
  legal_name: "Main Street LLC",
  address_line1: "100 Main St",
  address_line2: null,
  city: "Albany",
  state: "NY",
  zip: "12207",
  phone: null,
  email: null,
  header_text: null,
  tax_rate_default: 0.0625,
  timezone: "America/New_York",
  scratch_bundle_size_default: 100,
  include_billpay_in_gross: true,
  include_lottery_in_gross: true,
  allow_staff_view_history: false,
  allow_staff_print_pdf: false,
  allow_staff_export: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("RBAC + offline safety", () => {
  beforeEach(async () => {
    offlineDb.close();
    await offlineDb.delete();
    await offlineDb.open();
  });

  it("ADMIN can edit old closings", () => {
    const canEdit = canModifyExistingClosing({
      role: "ADMIN",
      existingStatus: "FINALIZED",
      createdBy: "someone-else",
      userId: "admin-user"
    });
    expect(canEdit).toBe(true);
  });

  it("STAFF can create draft", async () => {
    const draft = createEmptyClosing(storeFixture);
    await saveClosingLocallyAndQueue({ values: draft, role: "STAFF" });
    const local = await offlineDb.closings.get(draft.id);
    expect(local?.status).toBe("DRAFT");
  });

  it("STAFF can edit own DRAFT before submission", () => {
    const canEdit = canModifyExistingClosing({
      role: "STAFF",
      existingStatus: "DRAFT",
      createdBy: "staff-user",
      userId: "staff-user"
    });
    expect(canEdit).toBe(true);
  });

  it("STAFF cannot edit after submission/finalization", () => {
    expect(
      canModifyExistingClosing({
        role: "STAFF",
        existingStatus: "SUBMITTED",
        createdBy: "staff-user",
        userId: "staff-user"
      })
    ).toBe(false);
    expect(
      canModifyExistingClosing({
        role: "STAFF",
        existingStatus: "FINALIZED",
        createdBy: "staff-user",
        userId: "staff-user"
      })
    ).toBe(false);
  });

  it("STAFF cannot delete", () => {
    expect(canDeleteClosing("STAFF")).toBe(false);
    expect(canDeleteClosing("ADMIN")).toBe(true);
  });

  it("STAFF cannot access settings/team management", () => {
    expect(canAccessAdminRoute("STAFF")).toBe(false);
    expect(canAccessAdminRoute("ADMIN")).toBe(true);
  });

  it("RLS-equivalent guard rejects unauthorized updates even if frontend is bypassed", () => {
    const result = canModifyExistingClosing({
      role: "STAFF",
      existingStatus: "LOCKED",
      createdBy: "staff-user",
      userId: "staff-user"
    });
    expect(result).toBe(false);
  });

  it("Offline sync layer rejects locked-entry edits by staff and surfaces readable error", async () => {
    const draft = createEmptyClosing(storeFixture);
    await offlineDb.closings.put({
      ...draft,
      status: "FINALIZED",
      updated_at: new Date().toISOString(),
      _dirty: false
    });

    await expect(saveClosingLocallyAndQueue({ values: draft, role: "STAFF" })).rejects.toThrow(
      "This record is locked or you do not have permission to edit it."
    );
  });
});
