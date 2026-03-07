import { describe, expect, it } from "vitest";
import {
  createLotteryMasterFormState,
  parseLotteryMasterFormState
} from "@/lib/lottery/master-form";
import { LotteryMasterEntry } from "@/lib/types";

const entryFixture: LotteryMasterEntry = {
  id: "bc7307d3-bc44-4ad4-bb8f-c2bcd2af4d58",
  store_id: "780a222a-f3b1-47b3-a8de-35dff5790a12",
  display_number: 12,
  name: "Cashword",
  ticket_price: 5,
  default_bundle_size: 200,
  is_active: true,
  is_locked: true,
  notes: "Pinned",
  created_by_app_user_id: null,
  updated_by_app_user_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("lottery master form utilities", () => {
  it("builds add/edit form state using string values for smooth typing", () => {
    const addState = createLotteryMasterFormState({
      nextDisplayNumber: 7,
      defaultBundleSize: 100,
      defaultLocked: true
    });
    expect(addState.display_number).toBe("7");
    expect(addState.ticket_price).toBe("0");
    expect(addState.default_bundle_size).toBe("100");
    expect(addState.is_locked).toBe(true);

    const editState = createLotteryMasterFormState({
      entry: entryFixture,
      nextDisplayNumber: 99,
      defaultBundleSize: 100
    });
    expect(editState.display_number).toBe("12");
    expect(editState.ticket_price).toBe("5");
    expect(editState.default_bundle_size).toBe("200");
    expect(editState.name).toBe("Cashword");
  });

  it("parses valid string inputs on submit", () => {
    const parsed = parseLotteryMasterFormState({
      id: entryFixture.id,
      display_number: "15",
      name: "  New Name  ",
      ticket_price: "7.5",
      default_bundle_size: "300",
      is_active: false,
      is_locked: true,
      notes: "  test note "
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.data.display_number).toBe(15);
    expect(parsed.data.name).toBe("New Name");
    expect(parsed.data.ticket_price).toBe(7.5);
    expect(parsed.data.default_bundle_size).toBe(300);
    expect(parsed.data.is_active).toBe(false);
    expect(parsed.data.is_locked).toBe(true);
    expect(parsed.data.notes).toBe("test note");
  });

  it("does not coerce empty amount or lottery number to 0/defaults", () => {
    const emptyNumber = parseLotteryMasterFormState({
      display_number: "",
      name: "Cashword",
      ticket_price: "5",
      default_bundle_size: "100",
      is_active: true,
      is_locked: false,
      notes: ""
    });
    expect(emptyNumber.ok).toBe(false);
    if (!emptyNumber.ok) {
      expect(emptyNumber.error).toMatch(/Lottery number is required/i);
    }

    const emptyAmount = parseLotteryMasterFormState({
      display_number: "1",
      name: "Cashword",
      ticket_price: "",
      default_bundle_size: "100",
      is_active: true,
      is_locked: false,
      notes: ""
    });
    expect(emptyAmount.ok).toBe(false);
    if (!emptyAmount.ok) {
      expect(emptyAmount.error).toMatch(/Amount is required/i);
    }
  });
});
