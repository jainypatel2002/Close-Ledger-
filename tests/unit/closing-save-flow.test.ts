import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { saveAndMaybeSync } from "@/lib/closing/save";
import { offlineDb } from "@/lib/offline/db";
import { Store } from "@/lib/types";

const storeFixture: Store = {
  id: "236f0f56-2c93-4de1-a12d-5f7402dc8c1e",
  owner_id: "a4ec6af7-78cc-46a0-b17b-cd4ec17b8804",
  store_name: "Save Flow Store",
  legal_name: "Save Flow LLC",
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

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online
  });
};

describe("closing save flow", () => {
  beforeEach(async () => {
    offlineDb.close();
    await offlineDb.delete();
    await offlineDb.open();
    setOnline(true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves draft to server and marks local cache clean", async () => {
    const draft = createEmptyClosing(storeFixture);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: draft.id, status: "DRAFT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveAndMaybeSync({ values: draft, role: "ADMIN" });

    expect(result.persisted).toBe("server");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const local = await offlineDb.closings.get(draft.id);
    expect(local?._dirty).toBe(false);
  });

  it("requires online server persistence for submit/finalize", async () => {
    const draft = createEmptyClosing(storeFixture);
    setOnline(false);

    await expect(
      saveAndMaybeSync({
        values: { ...draft, status: "SUBMITTED" },
        role: "STAFF",
        requireServer: true
      })
    ).rejects.toThrow("offline");
  });

  it("saves drafts offline and queues sync mutation", async () => {
    const draft = createEmptyClosing(storeFixture);
    setOnline(false);

    const result = await saveAndMaybeSync({ values: draft, role: "STAFF" });

    expect(result.persisted).toBe("offline");
    const local = await offlineDb.closings.get(draft.id);
    expect(local?._dirty).toBe(true);
    const queue = await offlineDb.mutations.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("UPSERT_CLOSING");
  });

  it("updates local record id when server resolves to an existing day record", async () => {
    const draft = createEmptyClosing(storeFixture);
    const resolvedId = "6cd97b55-f1d6-43f4-8f35-02db12db93f2";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: resolvedId, status: "DRAFT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveAndMaybeSync({ values: draft, role: "ADMIN" });

    expect(result.id).toBe(resolvedId);
    expect(await offlineDb.closings.get(draft.id)).toBeUndefined();
    const resolved = await offlineDb.closings.get(resolvedId);
    expect(resolved).toBeTruthy();
    expect(resolved?.status).toBe("DRAFT");
  });

  it.each(["SUBMITTED", "FINALIZED", "LOCKED"] as const)(
    "persists %s status to the server when the action succeeds",
    async (status) => {
      const draft = createEmptyClosing(storeFixture);
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: draft.id, status }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await saveAndMaybeSync({
        values: { ...draft, status },
        role: "ADMIN",
        requireServer: true
      });

      expect(result.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      const payload = JSON.parse(String(init?.body ?? "{}"));
      expect(payload.status).toBe(status);
    }
  );

  it("normalizes missing child row ids before saving", async () => {
    const draft = createEmptyClosing(storeFixture);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: draft.id, status: "DRAFT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    draft.billpay_lines = draft.billpay_lines.map(
      ({ id: _id, ...line }) => line as (typeof draft.billpay_lines)[number]
    );
    draft.payment_lines = draft.payment_lines.map(
      ({ id: _id, ...line }) => line as (typeof draft.payment_lines)[number]
    );
    draft.category_lines = draft.category_lines.map(
      ({ id: _id, ...line }) => line as (typeof draft.category_lines)[number]
    );

    await saveAndMaybeSync({ values: draft, role: "ADMIN" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(init?.body ?? "{}"));
    expect(payload.billpay_lines[0].id).toBeTruthy();
    expect(payload.payment_lines[0].id).toBeTruthy();
    expect(payload.category_lines[0].id).toBeTruthy();
  });
});
