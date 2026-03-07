import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LotteryMasterManager } from "@/components/lottery/lottery-master-manager";
import { LotteryMasterEntry } from "@/lib/types";

const {
  toastErrorMock,
  toastSuccessMock,
  toastInfoMock,
  lotteryPutMock,
  lotteryDeleteMock,
  enqueueMutationMock
} = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastInfoMock: vi.fn(),
  lotteryPutMock: vi.fn(),
  lotteryDeleteMock: vi.fn(),
  enqueueMutationMock: vi.fn()
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    info: toastInfoMock
  }
}));

vi.mock("@/lib/offline/db", () => ({
  offlineDb: {
    lotteryMasterEntries: {
      put: lotteryPutMock,
      delete: lotteryDeleteMock
    }
  }
}));

vi.mock("@/lib/offline/sync", () => ({
  enqueueMutation: enqueueMutationMock
}));

const storeId = "8e313dd2-29cf-4dad-a5ca-cd0b0a73473d";
const lockedEntryFixture: LotteryMasterEntry = {
  id: "6afe31d6-36a9-4f44-8d18-c68f8f840588",
  store_id: storeId,
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

describe("LotteryMasterManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets admin edit a locked lottery and updates the list immediately", async () => {
    const user = userEvent.setup();
    const updatedEntry: LotteryMasterEntry = {
      ...lockedEntryFixture,
      display_number: 8,
      name: "Cashword Plus",
      ticket_price: 7.5
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: updatedEntry })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LotteryMasterManager storeId={storeId} initialEntries={[lockedEntryFixture]} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const numberInput = screen.getByRole("spinbutton", {
      name: "Lottery Number"
    }) as HTMLInputElement;
    await user.clear(numberInput);
    expect(numberInput.value).toBe("");
    await user.type(numberInput, "8");

    const nameInput = screen.getByRole("textbox", { name: "Lottery Name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Cashword Plus");

    const amountInput = screen.getByRole("spinbutton", {
      name: "Lottery Amount"
    }) as HTMLInputElement;
    await user.clear(amountInput);
    expect(amountInput.value).toBe("");
    await user.type(amountInput, "7.5");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/lottery-master/${lockedEntryFixture.id}`);
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body));
    expect(body.display_number).toBe(8);
    expect(body.name).toBe("Cashword Plus");
    expect(body.ticket_price).toBe(7.5);
    expect(body.is_locked).toBe(true);

    await waitFor(() => {
      expect(screen.getByText("Cashword Plus")).toBeInTheDocument();
      expect(screen.getByText("$7.50")).toBeInTheDocument();
    });
  });

  it("keeps lottery number editable so it can be cleared and replaced", async () => {
    const user = userEvent.setup();
    render(<LotteryMasterManager storeId={storeId} initialEntries={[lockedEntryFixture]} />);

    await user.click(screen.getByRole("button", { name: "Add Lottery" }));

    const numberInput = screen.getByRole("spinbutton", {
      name: "Lottery Number"
    }) as HTMLInputElement;
    await user.clear(numberInput);
    expect(numberInput.value).toBe("");
    await user.type(numberInput, "25");
    expect(numberInput.value).toBe("25");
  });

  it("keeps amount editable so it can be cleared and replaced instead of snapping to 0", async () => {
    const user = userEvent.setup();
    render(<LotteryMasterManager storeId={storeId} initialEntries={[lockedEntryFixture]} />);

    await user.click(screen.getByRole("button", { name: "Add Lottery" }));

    const amountInput = screen.getByRole("spinbutton", {
      name: "Lottery Amount"
    }) as HTMLInputElement;
    await user.clear(amountInput);
    expect(amountInput.value).toBe("");
    await user.type(amountInput, "50");
    expect(amountInput.value).toBe("50");
  });
});
