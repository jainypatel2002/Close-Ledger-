import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClosingWizard } from "@/components/closing/closing-wizard";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { LotteryMasterEntry, Store } from "@/lib/types";

const {
  saveAndMaybeSyncMock,
  enqueueMutationMock,
  generateOfflinePdfMock,
  downloadPdfMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  windowOpenMock
} = vi.hoisted(() => ({
  saveAndMaybeSyncMock: vi.fn(),
  enqueueMutationMock: vi.fn(),
  generateOfflinePdfMock: vi.fn(),
  downloadPdfMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  windowOpenMock: vi.fn()
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

vi.mock("@/components/ui/depth-button", () => ({
  DepthButton: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  )
}));

vi.mock("@/lib/offline/db", () => ({
  offlineDb: {
    closings: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
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
    },
    mutations: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(async () => [])
        }))
      })),
      bulkDelete: vi.fn()
    }
  }
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
    success: toastSuccessMock
  }
}));

const storeFixture: Store = {
  id: "2a3ca5ca-1d73-46ce-9eb5-414a3fffeb03",
  owner_id: "8f12bf98-f95a-40d8-b80b-39f15340d8a9",
  store_name: "Action Test Mart",
  legal_name: "Action Test Mart LLC",
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

const lotteryFixture: LotteryMasterEntry = {
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

const goToReview = async (user: ReturnType<typeof userEvent.setup>) => {
  for (let step = 0; step < 5; step += 1) {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
};

describe("ClosingWizard action flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = windowOpenMock as typeof window.open;
    window.confirm = vi.fn(() => true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: "https://example.com/report.pdf" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    generateOfflinePdfMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("normalizes missing row ids so save draft is not blocked by a generic Required error", async () => {
    const user = userEvent.setup();
    const initialValue = createEmptyClosing(storeFixture, [lotteryFixture]);
    initialValue.billpay_lines = initialValue.billpay_lines.map(({ id: _id, ...line }) => line as never);
    initialValue.payment_lines = initialValue.payment_lines.map(({ id: _id, ...line }) => line as never);
    initialValue.lottery_lines = initialValue.lottery_lines.map(({ id: _id, ...line }) => line as never);

    saveAndMaybeSyncMock.mockResolvedValue({
      id: initialValue.id,
      status: "DRAFT",
      persisted: "server"
    });

    render(
      <ClosingWizard
        store={storeFixture}
        role="ADMIN"
        initialValue={initialValue}
        lotteryMasterEntries={[lotteryFixture]}
        allowPrintPdf
      />
    );

    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() => expect(saveAndMaybeSyncMock).toHaveBeenCalledTimes(1));
    const call = saveAndMaybeSyncMock.mock.calls[0]?.[0];
    expect(call.values.billpay_lines[0].id).toBeTruthy();
    expect(call.values.payment_lines[0].id).toBeTruthy();
    expect(call.values.lottery_lines[0].id).toBeTruthy();
    expect(toastErrorMock).not.toHaveBeenCalledWith("Required");
    expect(toastSuccessMock).toHaveBeenCalledWith("Draft saved.");
  });

  it("keeps form values intact when save fails and surfaces the real error", async () => {
    const user = userEvent.setup();
    const initialValue = createEmptyClosing(storeFixture, [lotteryFixture]);
    saveAndMaybeSyncMock.mockRejectedValue(new Error("Store access denied."));

    render(
      <ClosingWizard
        store={storeFixture}
        role="ADMIN"
        initialValue={initialValue}
        lotteryMasterEntries={[lotteryFixture]}
        allowPrintPdf
      />
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    const notes = screen.getByPlaceholderText("Shift notes, overrides, or incidents...");
    await user.clear(notes);
    await user.type(notes, "Drawer counted twice.");

    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Store access denied."));
    expect(screen.getByDisplayValue("Drawer counted twice.")).toBeInTheDocument();
  });

  it("removes over/short from the review UI", async () => {
    const user = userEvent.setup();
    const initialValue = createEmptyClosing(storeFixture, [lotteryFixture]);

    render(
      <ClosingWizard
        store={storeFixture}
        role="ADMIN"
        initialValue={initialValue}
        lotteryMasterEntries={[lotteryFixture]}
        allowPrintPdf
      />
    );

    await goToReview(user);
    expect(screen.queryByText(/Over\/short/i)).not.toBeInTheDocument();
  });

  it("generates a PDF from the action bar", async () => {
    const user = userEvent.setup();
    const initialValue = createEmptyClosing(storeFixture, [lotteryFixture]);
    saveAndMaybeSyncMock.mockResolvedValue({
      id: initialValue.id,
      status: "DRAFT",
      persisted: "server"
    });

    render(
      <ClosingWizard
        store={storeFixture}
        role="ADMIN"
        initialValue={initialValue}
        lotteryMasterEntries={[lotteryFixture]}
        allowPrintPdf
      />
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    const notes = screen.getByPlaceholderText("Shift notes, overrides, or incidents...");
    await user.clear(notes);
    await user.type(notes, "Print with current draft.");
    expect(screen.getByDisplayValue("Print with current draft.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate PDF" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(windowOpenMock).toHaveBeenCalledWith(
      "https://example.com/report.pdf",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
