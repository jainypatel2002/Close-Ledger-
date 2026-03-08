import { describe, expect, it } from "vitest";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { closingFormSchema, normalizeClosingFormValues } from "@/lib/validation/closing";
import { Store } from "@/lib/types";

const storeFixture: Store = {
  id: "385f8f9f-2487-4f9a-b669-5ba307f3740c",
  owner_id: "a6b3f40a-7ab9-4bf6-a16a-001fb58a7b74",
  store_name: "Validation Compat Mart",
  legal_name: "Validation Compat LLC",
  address_line1: "100 Main St",
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

describe("closing validation compatibility", () => {
  it("derives missing sales/payment arrays from legacy top-level fields", () => {
    const draft = createEmptyClosing(storeFixture);
    const parsed = closingFormSchema.parse(
      normalizeClosingFormValues({
        ...draft,
        category_lines: undefined,
        lottery_lines: undefined,
        billpay_lines: undefined,
        payment_lines: undefined,
        vendor_payout_lines: undefined,
        taxable_sales: 310,
        non_taxable_sales: 95,
        cash_amount: 120,
        card_amount: 70,
        ebt_amount: 15,
        other_amount: 5
      })
    );

    expect(parsed.category_lines).toHaveLength(2);
    expect(parsed.category_lines.find((line) => line.taxable)?.amount).toBe(310);
    expect(parsed.category_lines.find((line) => !line.taxable)?.amount).toBe(95);

    expect(parsed.payment_lines).toHaveLength(4);
    expect(parsed.payment_lines.find((line) => line.payment_type === "cash")?.amount).toBe(120);
    expect(parsed.payment_lines.find((line) => line.payment_type === "card")?.amount).toBe(70);
    expect(parsed.billpay_lines).toEqual([]);
    expect(parsed.lottery_lines).toEqual([]);
    expect(parsed.vendor_payout_lines).toEqual([]);
  });
});
