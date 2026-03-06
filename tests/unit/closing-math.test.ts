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
      computeScratchTicketsSold({ start: 100, end: 98, inclusive: false }).ticketsSold
    ).toBe(2);
    expect(computeScratchTicketsSold({ start: 39, end: 38, inclusive: true }).ticketsSold).toBe(1);
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
          start_ticket_number: 15,
          end_ticket_number: 10,
          inclusive_count: false,
          ticket_price: 2
        }
      ],
      lottery_online_amount: 3,
      lottery_paid_out_amount: 5,
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
    expect(totals.lottery_total_scratch_revenue).toBe(10);
    expect(totals.lottery_amount_due).toBe(8);
    expect(totals.lottery_total_sales).toBe(13);
    expect(totals.lottery_total_payouts).toBe(5);
    expect(totals.billpay_collected_total).toBe(20);
    expect(totals.gross_collected).toBe(108);
    expect(totals.tax_amount).toBe(5);
    expect(totals.cash_over_short).toBe(7);
  });
});
