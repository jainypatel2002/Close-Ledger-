import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/closings/upsert/route";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { Store } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getMembershipForStoreMock: vi.fn(),
  computeSnapshotLineTotalsMock: vi.fn(() => ({
    ticketsSold: 0,
    salesAmount: 0,
    netAmount: 0
  }))
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: mocks.fromMock
  })
}));

vi.mock("@/lib/server/rbac", () => ({
  getCurrentUser: mocks.getCurrentUserMock,
  getMembershipForStore: mocks.getMembershipForStoreMock
}));

vi.mock("@/lib/server/closing-permissions", () => ({
  canModifyExistingClosing: vi.fn(() => true)
}));

vi.mock("@/lib/lottery/snapshots", () => ({
  buildLotteryLinesFromMasterEntries: vi.fn(() => []),
  computeSnapshotLineTotals: mocks.computeSnapshotLineTotalsMock
}));

const storeFixture: Store = {
  id: "2a3ca5ca-1d73-46ce-9eb5-414a3fffeb03",
  owner_id: "8f12bf98-f95a-40d8-b80b-39f15340d8a9",
  store_name: "Route Test Mart",
  legal_name: "Route Test Mart LLC",
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

interface MockState {
  closingDayUpserts: Array<Record<string, unknown>>;
  tableUpserts: Record<string, Array<unknown>>;
  paymentTableMissing?: boolean;
  auditError?: unknown;
}

const createTableMock = (table: string, state: MockState) => {
  const context: {
    mode: "query" | "upsert" | "delete" | "update";
    payload: unknown;
  } = {
    mode: "query",
    payload: null
  };

  const execute = async () => {
    if (context.mode === "upsert") {
      state.tableUpserts[table] = state.tableUpserts[table] ?? [];
      state.tableUpserts[table].push(context.payload);

      if (table === "closing_days") {
        const payload = context.payload as Record<string, unknown>;
        state.closingDayUpserts.push(payload);
        if ("payments_total" in payload) {
          return {
            data: null,
            error: {
              code: "PGRST204",
              message:
                "Could not find the 'payments_total' column of 'closing_days' in the schema cache"
            }
          };
        }
        return {
          data: {
            id: String(payload.id),
            status: String(payload.status),
            version: 1,
            submitted_at: null,
            finalized_at: null
          },
          error: null
        };
      }

      if (table === "payment_lines" && state.paymentTableMissing) {
        return {
          error: {
            code: "PGRST205",
            message: "Could not find the table 'public.payment_lines' in the schema cache"
          }
        };
      }

      return { error: null };
    }

    if (context.mode === "delete") {
      if (table === "payment_lines" && state.paymentTableMissing) {
        return {
          error: {
            code: "PGRST205",
            message: "Could not find the table 'public.payment_lines' in the schema cache"
          }
        };
      }
      return { error: null };
    }

    if (context.mode === "update" && table === "closing_days") {
      const payload = context.payload as Record<string, unknown>;
      return {
        data: {
          id: String(payload.id ?? crypto.randomUUID()),
          status: String(payload.status ?? "DRAFT"),
          version: 2,
          submitted_at: null,
          finalized_at: null
        },
        error: null
      };
    }

    return { data: null, error: null };
  };

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    not: vi.fn(() => builder),
    delete: vi.fn(() => {
      context.mode = "delete";
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      context.mode = "update";
      context.payload = payload;
      return builder;
    }),
    upsert: vi.fn((payload: unknown) => {
      context.mode = "upsert";
      context.payload = payload;
      return builder;
    }),
    insert: vi.fn(async (payload: unknown) => {
      state.tableUpserts[table] = state.tableUpserts[table] ?? [];
      state.tableUpserts[table].push(payload);
      return { error: table === "audit_log" ? state.auditError ?? null : null };
    }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => execute()),
    then: (resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
      execute().then(resolve, reject)
  };

  return builder;
};

describe("closing upsert route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserMock.mockResolvedValue({
      id: "71a55c87-3666-4af2-b38f-8b7785d8d67d"
    });
    mocks.getMembershipForStoreMock.mockResolvedValue({
      id: "membership-1",
      store_id: storeFixture.id,
      user_id: "71a55c87-3666-4af2-b38f-8b7785d8d67d",
      role: "ADMIN",
      is_active: true,
      permissions: {
        can_create_closing: true
      }
    });
  });

  it("retries closing_days save without new columns when the database is on the legacy schema", async () => {
    const state: MockState = {
      closingDayUpserts: [],
      tableUpserts: {}
    };
    mocks.fromMock.mockImplementation((table: string) => createTableMock(table, state));

    const closing = createEmptyClosing(storeFixture);
    const response = await POST(
      new NextRequest("http://localhost/api/closings/upsert", {
        method: "POST",
        body: JSON.stringify(closing),
        headers: { "Content-Type": "application/json" }
      })
    );
    const payload = (await response.json()) as { id?: string; status?: string; error?: string };

    expect(response.status).toBe(200);
    expect(payload.id).toBe(closing.id);
    expect(payload.status).toBe("DRAFT");
    expect(state.closingDayUpserts).toHaveLength(2);
    expect(state.closingDayUpserts[0]).toHaveProperty("payments_total");
    expect(state.closingDayUpserts[1]).not.toHaveProperty("payments_total");
  });

  it("does not fail the closing action when payment_lines table is missing", async () => {
    const state: MockState = {
      closingDayUpserts: [],
      tableUpserts: {},
      paymentTableMissing: true
    };
    mocks.fromMock.mockImplementation((table: string) => createTableMock(table, state));

    const closing = createEmptyClosing(storeFixture);
    const response = await POST(
      new NextRequest("http://localhost/api/closings/upsert", {
        method: "POST",
        body: JSON.stringify(closing),
        headers: { "Content-Type": "application/json" }
      })
    );
    const payload = (await response.json()) as { id?: string; status?: string; error?: string };

    expect(response.status).toBe(200);
    expect(payload.id).toBe(closing.id);
    expect(payload.status).toBe("DRAFT");
  });

  it("treats manual audit insert as best effort instead of blocking the save", async () => {
    const state: MockState = {
      closingDayUpserts: [],
      tableUpserts: {},
      auditError: {
        message: "new row violates row-level security policy for table \"audit_log\""
      }
    };
    mocks.fromMock.mockImplementation((table: string) => createTableMock(table, state));

    const closing = createEmptyClosing(storeFixture);
    const response = await POST(
      new NextRequest("http://localhost/api/closings/upsert", {
        method: "POST",
        body: JSON.stringify(closing),
        headers: { "Content-Type": "application/json" }
      })
    );
    const payload = (await response.json()) as { id?: string; status?: string; error?: string };

    expect(response.status).toBe(200);
    expect(payload.id).toBe(closing.id);
    expect(payload.status).toBe("DRAFT");
  });
});
