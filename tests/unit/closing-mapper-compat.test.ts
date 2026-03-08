import { describe, expect, it } from "vitest";
import { toClosingFormValues } from "@/lib/closing/mapper";

describe("closing mapper compatibility", () => {
  it("builds fallback payment lines from legacy summary fields", () => {
    const values = toClosingFormValues({
      closing: {
        id: "4dc7f6e6-f0b7-4efd-a7cc-107b8f6c0d52",
        store_id: "bf7c7b8f-9ec5-44c4-9927-6e06f6f56fef",
        business_date: "2026-03-01",
        status: "DRAFT",
        tax_mode: "AUTO",
        tax_rate_used: 0.0625,
        tax_override_enabled: false,
        tax_amount_manual: null,
        taxable_sales: 300,
        non_taxable_sales: 100,
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
        notes: "",
        include_billpay_in_gross: true,
        include_lottery_in_gross: true
      },
      categories: [],
      lottery: [],
      billpay: [],
      paymentLines: [],
      vendorPayouts: []
    });

    expect(values.payment_lines).toHaveLength(4);
    expect(values.payment_lines.find((line) => line.payment_type === "cash")?.amount).toBe(120);
    expect(values.payment_lines.find((line) => line.payment_type === "card")?.amount).toBe(80);
  });

  it("builds fallback product summary lines when category lines are missing", () => {
    const values = toClosingFormValues({
      closing: {
        id: "4dc7f6e6-f0b7-4efd-a7cc-107b8f6c0d53",
        store_id: "bf7c7b8f-9ec5-44c4-9927-6e06f6f56fef",
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
        cash_amount: 0,
        card_amount: 0,
        ebt_amount: 0,
        other_amount: 0,
        notes: "",
        include_billpay_in_gross: true,
        include_lottery_in_gross: true
      },
      categories: [],
      lottery: [],
      billpay: [],
      paymentLines: [],
      vendorPayouts: []
    });

    expect(values.category_lines).toHaveLength(2);
    expect(values.category_lines.find((line) => line.taxable)?.amount).toBe(410);
    expect(values.category_lines.find((line) => !line.taxable)?.amount).toBe(90);
  });
});
