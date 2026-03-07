import {
  computeLotteryAmountDue,
  computeLotteryNet,
  computeScratchRevenue,
  computeTicketsSold
} from "@/lib/math/lottery";
import { toMoney } from "@/lib/utils";

interface TaxInput {
  taxable_sales: number;
  tax_rate: number;
}

interface ScratchSoldInput {
  start: number;
  end: number;
  inclusive: boolean;
  manualOverride?: number | null;
  bundleSize?: number;
}

interface CategoryLineInput {
  amount: number;
  taxable: boolean;
}

interface ScratchLineInput {
  start_number?: number;
  end_number?: number;
  start_ticket_number?: number;
  end_ticket_number?: number;
  inclusive_count: boolean;
  ticket_price_snapshot?: number;
  ticket_price?: number;
  payouts?: number;
  scratch_payouts?: number;
  tickets_sold_override?: number | null;
  bundle_size_snapshot?: number;
  bundle_size?: number;
}

interface BillpayLineInput {
  amount_collected: number;
  fee_revenue: number;
  txn_count: number;
}

type PaymentType = "cash" | "card" | "ebt" | "other";

interface PaymentLineInput {
  payment_type: PaymentType | string;
  amount: number;
}

interface TotalsInput {
  categoryLines: CategoryLineInput[];
  lotteryScratchLines: ScratchLineInput[];
  lottery_online_amount: number;
  lottery_paid_out_amount: number;
  draw_sales: number;
  draw_payouts: number;
  billpayLines: BillpayLineInput[];
  tax_mode: "AUTO" | "MANUAL";
  tax_rate: number;
  tax_amount_manual?: number | null;
  includeBillpayInGross: boolean;
  includeLotteryInGross: boolean;
  paymentBreakdown?: {
    cash_amount: number;
    card_amount: number;
    ebt_amount: number;
    other_amount: number;
  };
  paymentLines?: PaymentLineInput[];
}

export const computeTaxableSalesTotal = (categoryLines: CategoryLineInput[]) =>
  toMoney(
    categoryLines
      .filter((line) => line.taxable)
      .reduce((sum, line) => sum + Math.max(0, Number(line.amount ?? 0)), 0)
  );

export const computeNonTaxableSalesTotal = (categoryLines: CategoryLineInput[]) =>
  toMoney(
    categoryLines
      .filter((line) => !line.taxable)
      .reduce((sum, line) => sum + Math.max(0, Number(line.amount ?? 0)), 0)
  );

export const computeTaxAmount = (taxableSales: number, taxRate: number) =>
  toMoney(Math.max(0, taxableSales) * Math.max(0, taxRate));

export const computeTax = ({ taxable_sales, tax_rate }: TaxInput): number =>
  computeTaxAmount(taxable_sales, tax_rate);

export const computeScratchTicketsSold = ({
  start,
  end,
  inclusive,
  manualOverride,
  bundleSize
}: ScratchSoldInput): { ticketsSold: number; warning?: string } => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ticketsSold: 0, warning: "Ticket range is incomplete." };
  }

  const ticketsSold = computeTicketsSold({
    startNumber: start,
    endNumber: end,
    inclusiveCount: inclusive,
    manualOverride
  });

  return {
    ticketsSold,
    warning:
      bundleSize && ticketsSold > bundleSize
        ? "Computed tickets sold exceeds bundle size."
        : undefined
  };
};

export const computePaymentOverShort = ({
  payments_total,
  gross_collected
}: {
  payments_total: number;
  gross_collected: number;
}) => toMoney(payments_total - gross_collected);

export const computePaymentTypeSubtotal = (
  paymentLines: PaymentLineInput[],
  type: PaymentType
) =>
  toMoney(
    paymentLines
      .filter((line) => String(line.payment_type).toLowerCase() === type)
      .reduce((sum, line) => sum + Math.max(0, Number(line.amount ?? 0)), 0)
  );

export const computeGrandPaymentsTotal = (paymentLines: PaymentLineInput[]) =>
  toMoney(
    paymentLines.reduce(
      (sum, line) => sum + Math.max(0, Number(line.amount ?? 0)),
      0
    )
  );

export const computeClosingTotals = (input: TotalsInput) => {
  const taxable_sales = computeTaxableSalesTotal(input.categoryLines);
  const non_taxable_sales = computeNonTaxableSalesTotal(input.categoryLines);
  const product_sales_total = toMoney(taxable_sales + non_taxable_sales);

  const scratchTotals = input.lotteryScratchLines.reduce(
    (acc, line) => {
      const startNumber = Number(line.start_number ?? line.start_ticket_number ?? 0);
      const endNumber = Number(line.end_number ?? line.end_ticket_number ?? 0);
      const ticketPrice = Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0);
      const bundleSize = Number(line.bundle_size_snapshot ?? line.bundle_size ?? 0);

      const { ticketsSold } = computeScratchTicketsSold({
        start: startNumber,
        end: endNumber,
        inclusive: line.inclusive_count,
        manualOverride: line.tickets_sold_override ?? null,
        bundleSize
      });
      const scratchSales = computeScratchRevenue(ticketsSold, ticketPrice);
      return {
        totalSales: toMoney(acc.totalSales + scratchSales)
      };
    },
    { totalSales: 0 }
  );

  const lottery_total_scratch_revenue = toMoney(scratchTotals.totalSales);
  const lottery_online_amount = toMoney(Math.max(0, input.lottery_online_amount));
  const lottery_paid_out_amount = toMoney(Math.max(0, input.lottery_paid_out_amount));
  const lottery_amount_due = computeLotteryAmountDue(
    lottery_total_scratch_revenue,
    lottery_paid_out_amount,
    lottery_online_amount
  );
  const lottery_total_sales = toMoney(lottery_total_scratch_revenue + lottery_online_amount);
  const lottery_total_payouts = lottery_paid_out_amount;
  const lottery_net = computeLotteryNet({
    salesAmount: lottery_total_sales,
    payouts: lottery_total_payouts
  });

  const billpay_collected_total = toMoney(
    input.billpayLines.reduce((sum, line) => sum + Math.max(0, line.amount_collected), 0)
  );
  const billpay_fee_revenue = toMoney(
    input.billpayLines.reduce((sum, line) => sum + Math.max(0, line.fee_revenue), 0)
  );
  const billpay_transactions_count = input.billpayLines.reduce(
    (sum, line) => sum + Math.max(0, Math.floor(line.txn_count)),
    0
  );

  const gross_collected = toMoney(
    product_sales_total +
      (input.includeLotteryInGross ? lottery_total_sales : 0) +
      (input.includeBillpayInGross ? billpay_collected_total : 0)
  );
  const true_revenue = toMoney(product_sales_total + lottery_net + billpay_fee_revenue);

  const tax_amount =
    input.tax_mode === "MANUAL" ||
    (input.tax_amount_manual !== null && input.tax_amount_manual !== undefined)
      ? toMoney(Math.max(0, input.tax_amount_manual ?? 0))
      : computeTaxAmount(taxable_sales, input.tax_rate);

  const total_sales_gross = toMoney(gross_collected);
  const paymentLines =
    input.paymentLines && input.paymentLines.length > 0
      ? input.paymentLines
      : [
          {
            payment_type: "cash",
            amount: Number(input.paymentBreakdown?.cash_amount ?? 0)
          },
          {
            payment_type: "card",
            amount: Number(input.paymentBreakdown?.card_amount ?? 0)
          },
          {
            payment_type: "ebt",
            amount: Number(input.paymentBreakdown?.ebt_amount ?? 0)
          },
          {
            payment_type: "other",
            amount: Number(input.paymentBreakdown?.other_amount ?? 0)
          }
        ];
  const cash_amount = computePaymentTypeSubtotal(paymentLines, "cash");
  const card_amount = computePaymentTypeSubtotal(paymentLines, "card");
  const ebt_amount = computePaymentTypeSubtotal(paymentLines, "ebt");
  const other_amount = computePaymentTypeSubtotal(paymentLines, "other");
  const payments_total = computeGrandPaymentsTotal(paymentLines);
  const cash_over_short = computePaymentOverShort({ payments_total, gross_collected });

  return {
    product_sales_total,
    taxable_sales,
    non_taxable_sales,
    lottery_total_scratch_revenue,
    lottery_online_amount,
    lottery_paid_out_amount,
    lottery_amount_due,
    lottery_total_sales,
    lottery_total_payouts,
    lottery_net,
    billpay_collected_total,
    billpay_fee_revenue,
    billpay_transactions_count,
    cash_amount,
    card_amount,
    ebt_amount,
    other_amount,
    gross_collected,
    true_revenue,
    tax_amount,
    payments_total,
    cash_over_short,
    total_sales_gross
  };
};
