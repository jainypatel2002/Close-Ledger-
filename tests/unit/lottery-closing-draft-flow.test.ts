import { describe, expect, it } from "vitest";
import { buildLotteryLineFromMasterEntry } from "@/lib/lottery/snapshots";
import {
  appendLotteryMasterEntryToDraftLines,
  buildNextClosingDraftForLotteryWorkflow,
  upsertLotteryMasterEntryInDraftLines
} from "@/lib/lottery/closing-draft";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { LotteryMasterEntry, Store } from "@/lib/types";

const storeFixture: Store = {
  id: "44f3578c-e898-44f3-9175-aa17b1206847",
  owner_id: "7f2dbe1c-92fb-48bb-99b9-e14f97f2e617",
  store_name: "Close Ledger Test",
  legal_name: null,
  address_line1: "10 Main St",
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

const lockedEntryFixture: LotteryMasterEntry = {
  id: "57f989a5-247e-4375-a76a-7f6ca5305f9b",
  store_id: storeFixture.id,
  display_number: 1,
  name: "Cashword",
  ticket_price: 2,
  default_bundle_size: 100,
  is_active: true,
  is_locked: true,
  notes: null,
  created_by_app_user_id: null,
  updated_by_app_user_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("lottery closing draft helpers", () => {
  it("appends new active lottery config to the current draft immediately", () => {
    const draft = createEmptyClosing(storeFixture, []);
    const appended = appendLotteryMasterEntryToDraftLines({
      currentLines: draft.lottery_lines,
      entry: lockedEntryFixture
    });

    expect(appended).toHaveLength(1);
    expect(appended[0].lottery_master_entry_id).toBe(lockedEntryFixture.id);
    expect(appended[0].display_number_snapshot).toBe(1);
    expect(appended[0].lottery_name_snapshot).toBe("Cashword");
    expect(appended[0].ticket_price_snapshot).toBe(2);
    expect(appended[0].is_locked_snapshot).toBe(true);
    expect(appended[0].start_number).toBeUndefined();
    expect(appended[0].end_number).toBeUndefined();
  });

  it("does not append inactive or duplicate lottery config rows", () => {
    const first = buildLotteryLineFromMasterEntry(lockedEntryFixture);
    const duplicateAttempt = appendLotteryMasterEntryToDraftLines({
      currentLines: [first],
      entry: lockedEntryFixture
    });
    expect(duplicateAttempt).toHaveLength(1);

    const inactiveAttempt = appendLotteryMasterEntryToDraftLines({
      currentLines: [first],
      entry: { ...lockedEntryFixture, id: "9d8d24c6-f13f-4475-8f15-a4cf9e0e1dd6", is_active: false }
    });
    expect(inactiveAttempt).toHaveLength(1);
  });

  it("updates current draft snapshots when admin edits an existing locked lottery", () => {
    const existingLine = {
      ...buildLotteryLineFromMasterEntry(lockedEntryFixture),
      start_number: 180,
      end_number: 160
    };
    const editedEntry = {
      ...lockedEntryFixture,
      display_number: 9,
      name: "Cashword Plus",
      ticket_price: 10,
      default_bundle_size: 150,
      is_locked: false
    };

    const result = upsertLotteryMasterEntryInDraftLines({
      currentLines: [existingLine],
      entry: editedEntry
    });

    expect(result.added).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].display_number_snapshot).toBe(9);
    expect(result.lines[0].lottery_name_snapshot).toBe("Cashword Plus");
    expect(result.lines[0].ticket_price_snapshot).toBe(10);
    expect(result.lines[0].bundle_size_snapshot).toBe(150);
    expect(result.lines[0].is_locked_snapshot).toBe(false);
    expect(result.lines[0].start_number).toBe(180);
    expect(result.lines[0].end_number).toBe(160);
  });

  it("builds a fresh next-entry draft that clears nightly values but keeps locked structure", () => {
    const nextDraft = buildNextClosingDraftForLotteryWorkflow({
      store: storeFixture,
      lotteryMasterEntries: [lockedEntryFixture],
      businessDate: "2026-03-06"
    });

    expect(nextDraft.status).toBe("DRAFT");
    expect(nextDraft.business_date).toBe("2026-03-06");
    expect(nextDraft.lottery_online_amount).toBe(0);
    expect(nextDraft.lottery_paid_out_amount).toBe(0);
    expect(nextDraft.lottery_amount_due).toBe(0);
    expect(nextDraft.lottery_lines).toHaveLength(1);
    expect(nextDraft.lottery_lines[0].lottery_name_snapshot).toBe("Cashword");
    expect(nextDraft.lottery_lines[0].ticket_price_snapshot).toBe(2);
    expect(nextDraft.lottery_lines[0].start_number).toBeUndefined();
    expect(nextDraft.lottery_lines[0].end_number).toBeUndefined();
  });

  it("keeps historical snapshots unchanged while future drafts use updated config", () => {
    const historicalLine = buildLotteryLineFromMasterEntry(lockedEntryFixture);
    const updatedEntry = {
      ...lockedEntryFixture,
      name: "Cashword Plus",
      ticket_price: 5
    };

    const nextDraft = buildNextClosingDraftForLotteryWorkflow({
      store: storeFixture,
      lotteryMasterEntries: [updatedEntry],
      businessDate: "2026-03-07"
    });

    expect(historicalLine.lottery_name_snapshot).toBe("Cashword");
    expect(historicalLine.ticket_price_snapshot).toBe(2);
    expect(nextDraft.lottery_lines[0].lottery_name_snapshot).toBe("Cashword Plus");
    expect(nextDraft.lottery_lines[0].ticket_price_snapshot).toBe(5);
  });
});
