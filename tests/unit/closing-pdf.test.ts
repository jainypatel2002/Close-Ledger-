import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { toClosingFormValues } from "@/lib/closing/mapper";
import { generateOfflineClosingPdf } from "@/lib/pdf/client-fallback";
import { generateClosingPdf } from "@/lib/pdf/closing-pdf";
import { LotteryMasterEntry, Store } from "@/lib/types";

const storeFixture: Store = {
  id: "2a3ca5ca-1d73-46ce-9eb5-414a3fffeb03",
  owner_id: "8f12bf98-f95a-40d8-b80b-39f15340d8a9",
  store_name: "PDF Test Mart",
  legal_name: "PDF Test Mart LLC",
  address_line1: "10 Main St",
  address_line2: null,
  city: "Albany",
  state: "NY",
  zip: "12207",
  phone: "518-555-1000",
  email: "store@example.com",
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

const decodePdf = (bytes: Uint8Array) => {
  const raw = Buffer.from(bytes);
  const marker = Buffer.from("stream\n");
  const endMarker = Buffer.from("endstream");
  let cursor = 0;
  let output = "";

  while (cursor < raw.length) {
    const start = raw.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const streamStart = start + marker.length;
    const end = raw.indexOf(endMarker, streamStart);
    if (end === -1) {
      break;
    }
    const chunk = raw.subarray(streamStart, end - 1);
    try {
      output += inflateSync(chunk)
        .toString("latin1")
        .replace(/<([0-9A-F]+)>/g, (_match, hex) =>
          Buffer.from(hex, "hex").toString("latin1")
        );
    } catch {
      output += chunk.toString("latin1");
    }
    cursor = end + endMarker.length;
  }

  return output;
};

describe("closing pdf generation", () => {
  it("renders a structured closing report without over/short", async () => {
    const bytes = await generateClosingPdf({
      store: storeFixture,
      closing: {
        id: "3d9207ad-d2a0-4f38-a65a-d0d7e1cf0d0b",
        store_id: storeFixture.id,
        business_date: "2026-03-08",
        status: "FINALIZED",
        gross_collected: 11581.97,
        true_revenue: 7682.97,
        total_sales_gross: 1499.97,
        taxable_sales: 1499.97,
        non_taxable_sales: 0,
        tax_rate_used: 0.0625,
        tax_amount: 93.75,
        draw_sales: 300,
        draw_payouts: 0,
        lottery_total_scratch_revenue: 7562,
        lottery_online_amount: 300,
        lottery_paid_out_amount: 3899,
        lottery_amount_due: 3963,
        lottery_total_sales: 7862,
        lottery_total_payouts: 3899,
        lottery_net: 3963,
        billpay_collected_total: 2220,
        billpay_fee_revenue: 120,
        billpay_transactions_count: 12,
        cash_amount: 1549,
        card_amount: 856,
        ebt_amount: 0,
        other_amount: 0,
        payments_total: 2405,
        notes: "Shift closed cleanly.",
        created_at: new Date().toISOString()
      },
      lotteryLines: [
        {
          display_number_snapshot: 1,
          lottery_name_snapshot: "Cashword",
          ticket_price_snapshot: 2,
          start_number: 200,
          end_number: 150,
          tickets_sold: 50,
          sales_amount: 100,
          payouts: 10
        },
        {
          display_number_snapshot: 2,
          lottery_name_snapshot: "Jumbo Bucks",
          ticket_price_snapshot: 5,
          start_number: 90,
          end_number: 60,
          tickets_sold: 30,
          sales_amount: 150,
          payouts: 25
        }
      ],
      billpayLines: [
        {
          provider_name: "Western Union",
          amount_collected: 2000,
          fee_revenue: 100,
          txn_count: 10
        }
      ],
      paymentLines: [
        { payment_type: "cash", label: "Cash Drawer", amount: 1549 },
        { payment_type: "card", label: "Terminal", amount: 856 }
      ],
      generatedAtIso: "2026-03-08T15:10:00.000Z"
    });

    const text = decodePdf(bytes);
    expect(text).toContain("Nightly Closing Report");
    expect(text).toContain("Summary");
    expect(text).toContain("Lottery Breakdown");
    expect(text).toContain("Payments & Tax");
    expect(text).toContain("Billpay");
    expect(text).toContain("Notes");
    expect(text).not.toContain("Over/short");
  });

  it("uses the structured renderer for offline PDFs too", async () => {
    const closing = createEmptyClosing(storeFixture, [lotteryFixture]);
    closing.notes = "Offline draft note.";
    closing.lottery_online_amount = 25;
    closing.lottery_paid_out_amount = 5;
    closing.lottery_lines[0].start_number = 20;
    closing.lottery_lines[0].end_number = 10;

    const bytes = await generateOfflineClosingPdf({
      store: storeFixture,
      closing,
      generatedAtIso: "2026-03-08T15:10:00.000Z"
    });

    const text = decodePdf(bytes);
    expect(text).toContain("Nightly Closing Report");
    expect(text).toContain("OFFLINE PDF");
    expect(text).toContain("Lottery Breakdown");
    expect(text).toContain("Offline draft note.");
  });

  it("renders legacy closings safely after mapper fallback normalization", async () => {
    const legacyValues = toClosingFormValues({
      closing: {
        id: "4dc7f6e6-f0b7-4efd-a7cc-107b8f6c0d52",
        store_id: storeFixture.id,
        business_date: "2026-03-01",
        status: "DRAFT",
        tax_mode: "AUTO",
        tax_rate_used: 0.0625,
        tax_override_enabled: false,
        tax_amount_manual: null,
        taxable_sales: 410,
        non_taxable_sales: 90,
        lottery_total_scratch_revenue: 0,
        lottery_online_amount: 0,
        lottery_paid_out_amount: 0,
        lottery_amount_due: 0,
        draw_sales: 0,
        draw_payouts: 0,
        cash_amount: 120,
        card_amount: 80,
        ebt_amount: 20,
        other_amount: 10,
        notes: "Legacy record",
        include_billpay_in_gross: true,
        include_lottery_in_gross: true
      },
      categories: [],
      lottery: [],
      billpay: [],
      paymentLines: [],
      vendorPayouts: []
    });

    const bytes = await generateOfflineClosingPdf({
      store: storeFixture,
      closing: legacyValues,
      generatedAtIso: "2026-03-08T15:10:00.000Z"
    });

    const text = decodePdf(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(text).toContain("Legacy record");
    expect(text).toContain("Payment Breakdown");
  });
});
