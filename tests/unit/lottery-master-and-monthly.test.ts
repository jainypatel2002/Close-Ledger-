import { beforeEach, describe, expect, it } from "vitest";
import { aggregateMonthlyLotteryData } from "@/lib/analytics/monthly";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { saveClosingLocallyAndQueue } from "@/lib/closing/save";
import {
  computeLotteryAmountDue,
  computeLotteryNet,
  computeLotterySales,
  computeScratchRevenue,
  computeScratchSold,
  computeTicketsSold,
  computeTotalScratchRevenue,
  validateLotteryRange
} from "@/lib/math/lottery";
import { buildLotteryLinesFromMasterEntries } from "@/lib/lottery/snapshots";
import { offlineDb } from "@/lib/offline/db";
import { generateClosingPdf } from "@/lib/pdf/closing-pdf";
import { generateMonthlyReportPdf } from "@/lib/pdf/monthly-report-pdf";
import { canManageLotteryMasterCatalog } from "@/lib/server/lottery-master-permissions";
import { LotteryMasterEntry, Store } from "@/lib/types";

const storeFixture: Store = {
  id: "b13d357a-459f-4d15-8517-0a0812dfd8f9",
  owner_id: "2a57f6aa-23a8-4fd8-a4e0-f8e227f5d212",
  store_name: "Snapshot Mart",
  legal_name: "Snapshot Mart LLC",
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

const masterFixture: LotteryMasterEntry[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
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
  }
];

describe("lottery master + monthly integration", () => {
  beforeEach(async () => {
    offlineDb.close();
    await offlineDb.delete();
    await offlineDb.open();
  });

  it("ADMIN can manage lottery catalog while STAFF cannot", () => {
    expect(canManageLotteryMasterCatalog("ADMIN")).toBe(true);
    expect(canManageLotteryMasterCatalog("STAFF")).toBe(false);
  });

  it("builds snapshot line items from lottery master entries", () => {
    const lines = buildLotteryLinesFromMasterEntries(masterFixture);
    expect(lines).toHaveLength(1);
    expect(lines[0].lottery_master_entry_id).toBe(masterFixture[0].id);
    expect(lines[0].lottery_name_snapshot).toBe("Cashword");
    expect(lines[0].ticket_price_snapshot).toBe(2);
    expect(lines[0].is_locked_snapshot).toBe(true);
  });

  it("changing master price later does not mutate old snapshots", () => {
    const oldSnapshot = buildLotteryLinesFromMasterEntries(masterFixture)[0];
    const updatedMaster = [{ ...masterFixture[0], ticket_price: 5, name: "Cashword Plus" }];
    const newSnapshot = buildLotteryLinesFromMasterEntries(updatedMaster)[0];

    expect(oldSnapshot.ticket_price_snapshot).toBe(2);
    expect(oldSnapshot.lottery_name_snapshot).toBe("Cashword");
    expect(newSnapshot.ticket_price_snapshot).toBe(5);
    expect(newSnapshot.lottery_name_snapshot).toBe("Cashword Plus");
  });

  it("computes sold/revenue/amount-due using the new downward ticket math", () => {
    expect(computeScratchSold(100, 98)).toBe(2);
    expect(computeScratchSold(39, 38)).toBe(1);
    expect(computeScratchSold(95, 87)).toBe(8);

    const sold = computeTicketsSold({
      startNumber: 95,
      endNumber: 87,
      inclusiveCount: false
    });
    const sales = computeLotterySales({ ticketsSold: sold, ticketPrice: 10 });
    const revenue = computeScratchRevenue(sold, 10);
    const totalScratchRevenue = computeTotalScratchRevenue([{ revenue }]);
    const amountDue = computeLotteryAmountDue(totalScratchRevenue, 100, 50);
    const net = computeLotteryNet({ salesAmount: sales, payouts: 100 });

    expect(sold).toBe(8);
    expect(sales).toBe(80);
    expect(revenue).toBe(80);
    expect(totalScratchRevenue).toBe(80);
    expect(amountDue).toBe(30);
    expect(net).toBe(-20);

    const valid = validateLotteryRange({
      startNumber: 120,
      endNumber: 1,
      inclusiveCount: false,
      bundleSize: 100
    });
    expect(valid.isValid).toBe(true);
    expect(valid.warning).toContain("bundle size");

    const invalid = validateLotteryRange({
      startNumber: 90,
      endNumber: 100,
      inclusiveCount: false,
      bundleSize: 100
    });
    expect(invalid.isValid).toBe(false);
  });

  it("monthly aggregation uses snapshot totals while allowing latest master name display", () => {
    const closings = [
      {
        id: "c1",
        business_date: "2026-02-01",
        lottery_total_sales: 40,
        lottery_total_payouts: 5,
        lottery_net: 35,
        lottery_total_scratch_revenue: 40,
        lottery_online_amount: 0,
        lottery_paid_out_amount: 5,
        lottery_amount_due: 35,
        draw_sales: 0,
        draw_payouts: 0
      }
    ];
    const lines = [
      {
        id: "l1",
        closing_day_id: "c1",
        lottery_master_entry_id: masterFixture[0].id,
        display_number_snapshot: 1,
        lottery_name_snapshot: "Cashword",
        ticket_price_snapshot: 2,
        start_number: 100,
        end_number: 80,
        tickets_sold: 20,
        sales_amount: 40,
        payouts: 5,
        net_amount: 35
      }
    ];
    const renamedMaster = [{ ...masterFixture[0], name: "Cashword Plus" }];

    const aggregation = aggregateMonthlyLotteryData({
      lotteryLines: lines,
      closings,
      lotteryMasterEntries: renamedMaster
    });

    expect(aggregation.summary.total_scratch_tickets_sold).toBe(20);
    expect(aggregation.summary.total_scratch_sales).toBe(40);
    expect(aggregation.summary.total_lottery_net).toBe(35);
    expect(aggregation.table[0].lottery_name).toBe("Cashword Plus");
  });

  it("legacy closings without new summary columns still aggregate safely", () => {
    const closings = [
      {
        id: "legacy-1",
        business_date: "2026-01-10",
        draw_sales: 10,
        draw_payouts: 2,
        lottery_total_sales: 50,
        lottery_total_payouts: 7,
        lottery_net: 43
      }
    ];
    const lines = [
      {
        id: "legacy-line-1",
        closing_day_id: "legacy-1",
        display_number_snapshot: 2,
        lottery_name_snapshot: "Lucky Sevens",
        ticket_price_snapshot: 5,
        start_number: 40,
        end_number: 30,
        tickets_sold: 10,
        sales_amount: 40,
        payouts: 5
      }
    ];
    const aggregation = aggregateMonthlyLotteryData({
      lotteryLines: lines,
      closings,
      lotteryMasterEntries: []
    });

    expect(aggregation.summary.total_scratch_revenue).toBe(40);
    expect(aggregation.summary.total_online_amount).toBe(10);
    expect(aggregation.summary.total_paid_out_amount).toBe(7);
    expect(aggregation.summary.total_amount_due).toBe(43);
  });

  it("daily closing PDF supports snapshot lottery rows", async () => {
    const bytes = await generateClosingPdf({
      store: {
        store_name: "Snapshot Mart",
        address_line1: "10 Main St",
        address_line2: null,
        city: "Albany",
        state: "NY",
        zip: "12207",
        phone: null,
        header_text: null
      },
      closing: {
        id: "close-1",
        business_date: "2026-03-01",
        status: "DRAFT",
        gross_collected: 100,
        true_revenue: 80,
        total_sales_gross: 70,
        taxable_sales: 70,
        non_taxable_sales: 0,
        tax_amount: 4.38,
        draw_sales: 0,
        draw_payouts: 0,
        lottery_total_scratch_revenue: 30,
        lottery_online_amount: 0,
        lottery_paid_out_amount: 5,
        lottery_amount_due: 25,
        lottery_total_sales: 30,
        lottery_total_payouts: 5,
        lottery_net: 25,
        billpay_collected_total: 0,
        billpay_fee_revenue: 0,
        cash_amount: 100,
        card_amount: 0,
        ebt_amount: 0,
        other_amount: 0,
        notes: "snapshot check",
        created_at: new Date().toISOString()
      },
      lotteryLines: [
        {
          display_number_snapshot: 1,
          lottery_name_snapshot: "Cashword",
          ticket_price_snapshot: 2,
          start_number: 100,
          end_number: 80,
          tickets_sold: 20,
          sales_amount: 40,
          payouts: 5,
          net_amount: 35
        }
      ],
      billpayLines: [],
      chartData: {
        gross: [
          { name: "Products", value: 70 },
          { name: "Lottery", value: 30 }
        ],
        payments: [{ name: "Cash", value: 100 }]
      }
    });

    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("offline-created closings keep lottery snapshots", async () => {
    const draft = createEmptyClosing(storeFixture, masterFixture);
    draft.lottery_lines[0].start_number = 20;
    draft.lottery_lines[0].end_number = 10;
    await saveClosingLocallyAndQueue({ values: draft, role: "STAFF" });

    const stored = await offlineDb.closings.get(draft.id);
    expect(stored?.lottery_lines[0].lottery_name_snapshot).toBe("Cashword");
    expect(stored?.lottery_lines[0].ticket_price_snapshot).toBe(2);
    expect(stored?.lottery_lines[0].display_number_snapshot).toBe(1);
  });

  it("monthly PDF generation returns printable bytes", async () => {
    const bytes = await generateMonthlyReportPdf({
      store: {
        store_name: "Snapshot Mart",
        legal_name: "Snapshot Mart LLC",
        address_line1: "10 Main St",
        address_line2: null,
        city: "Albany",
        state: "NY",
        zip: "12207",
        phone: null,
        email: null,
        header_text: null
      },
      monthLabel: "March 2026",
      generatedAtIso: new Date().toISOString(),
      note: "Monthly report note",
      summaryRows: [
        ["Gross Collected", 1000],
        ["True Revenue", 800]
      ],
      paymentRows: [{ name: "Cash", amount: 700, percent: 70 }],
      taxRows: [
        ["Total Taxable Sales", 600],
        ["Total Tax Collected", 37.5]
      ],
      lotteryRows: [
        {
          display_number: 1,
          lottery_name: "Cashword",
          total_tickets_sold: 200,
          total_scratch_sales: 400
        }
      ],
      dailyRows: [
        {
          date: "2026-03-01",
          status: "FINALIZED",
          gross_collected: 100,
          true_revenue: 80,
          lottery_sales: 20,
          billpay_collected: 5,
          tax_amount: 4.5,
          tickets_sold_total: 10
        }
      ],
      charts: {
        revenueCategories: [
          { name: "Products", value: 600, color: "#dc143c" },
          { name: "Lottery", value: 300, color: "#ff4f2e" }
        ],
        paymentMethods: [{ name: "Cash", value: 700, color: "#06d6a0" }],
        topLotteryTickets: [{ name: "Cashword", value: 200 }]
      }
    });

    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
