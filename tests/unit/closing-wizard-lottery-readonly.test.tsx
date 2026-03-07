import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClosingWizard } from "@/components/closing/closing-wizard";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { LotteryMasterEntry, Store } from "@/lib/types";

const { saveAndMaybeSyncMock, enqueueMutationMock, generateOfflinePdfMock, downloadPdfMock } =
  vi.hoisted(() => ({
    saveAndMaybeSyncMock: vi.fn(),
    enqueueMutationMock: vi.fn(),
    generateOfflinePdfMock: vi.fn(),
    downloadPdfMock: vi.fn()
  }));

vi.mock("@/lib/closing/save", () => ({
  saveAndMaybeSync: saveAndMaybeSyncMock
}));

vi.mock("@/lib/offline/sync", () => ({
  enqueueMutation: enqueueMutationMock
}));

vi.mock("@/lib/pdf/client-fallback", () => ({
  generateOfflineClosingPdf: generateOfflinePdfMock,
  downloadPdfBytes: downloadPdfMock
}));

vi.mock("@/lib/offline/db", () => ({
  offlineDb: {
    closings: {
      put: vi.fn()
    },
    lotteryMasterEntries: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(async () => [])
        }))
      }))
    },
    documents: {
      put: vi.fn()
    }
  }
}));

const storeFixture: Store = {
  id: "2a3ca5ca-1d73-46ce-9eb5-414a3fffeb03",
  owner_id: "8f12bf98-f95a-40d8-b80b-39f15340d8a9",
  store_name: "ReadOnly Test Mart",
  legal_name: "ReadOnly Test Mart LLC",
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
  id: "f40fdf0f-f2f8-4d48-a2a8-c1be9365c5f6",
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

describe("ClosingWizard lottery row behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps locked lottery identity fields read-only in nightly flow for staff", async () => {
    const user = userEvent.setup();
    const initialValue = createEmptyClosing(storeFixture, [lockedEntryFixture]);

    render(
      <ClosingWizard
        store={storeFixture}
        role="STAFF"
        initialValue={initialValue}
        lotteryMasterEntries={[lockedEntryFixture]}
        allowPrintPdf={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Next" }));

    const row = screen.getByText("Cashword").closest("tr");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(within(row).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    const rowInputs = within(row).getAllByRole("spinbutton") as HTMLInputElement[];
    expect(rowInputs).toHaveLength(2);
    expect(rowInputs[0].disabled).toBe(false);
    expect(rowInputs[1].disabled).toBe(false);
  });
});
