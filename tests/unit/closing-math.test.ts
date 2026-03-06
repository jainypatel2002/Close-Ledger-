import {
  computeClosingTotals,
  computePaymentOverShort,
  computeScratchTicketsSold,
  computeTax
} from "@/lib/math/closing";

describe("closing math", () => {
  it("computes tax", () => {
    expect(computeTax({ taxable_sales: 100, tax_rate: 0.0625 })).toBe(6.25);
  });

  it("computes scratch tickets sold with and without inclusive mode", () => {
    expect(
      computeScratchTicketsSold({ start: 100, end: 112, inclusive: false }).ticketsSold
    ).toBe(12);
    expect(
      computeScratchTicketsSold({ start: 100, end: 112, inclusive: true }).ticketsSold
    ).toBe(13);
  });

  it("computes over short", () => {
    expect(computePaymentOverShort({ payments_total: 120, gross_collected: 100 })).toBe(
      20
    );
  });

  it("computes totals object", () => {
    const totals = computeClosingTotals({
      categoryLines: [
        { amount: 50, taxable: true },
        { amount: 25, taxable: false }
      ],
      lotteryScratchLines: [
        {
          start_ticket_number: 10,
          end_ticket_number: 15,
          inclusive_count: false,
          ticket_price: 2,
          scratch_payouts: 5
        }
      ],
      draw_sales: 10,
      draw_payouts: 2,
      billpayLines: [{ amount_collected: 20, fee_revenue: 4, txn_count: 2 }],
      tax_mode: "AUTO",
      tax_rate: 0.1,
      tax_amount_manual: null,
      includeBillpayInGross: true,
      includeLotteryInGross: true,
      paymentBreakdown: {
        cash_amount: 30,
        card_amount: 50,
        ebt_amount: 20,
        other_amount: 15
      }
    });

    expect(totals.taxable_sales).toBe(50);
    expect(totals.non_taxable_sales).toBe(25);
    expect(totals.lottery_total_sales).toBe(20);
    expect(totals.billpay_collected_total).toBe(20);
    expect(totals.gross_collected).toBe(115);
    expect(totals.tax_amount).toBe(5);
    expect(totals.cash_over_short).toBe(0);
  });
});
