import { toMoney } from "@/lib/utils";

export interface ComputeTicketsSoldInput {
  startNumber: number;
  endNumber: number;
  inclusiveCount: boolean;
  manualOverride?: number | null;
}

export interface ValidateLotteryRangeInput {
  startNumber: number;
  endNumber: number;
  inclusiveCount: boolean;
  bundleSize: number;
}

export interface ValidateLotteryRangeResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  ticketsSold: number;
}

const toWhole = (value: number) => (Number.isFinite(value) ? Math.floor(value) : 0);

export const computeScratchSold = (startNumber: number, endNumber: number): number =>
  Math.max(0, toWhole(startNumber) - toWhole(endNumber));

export const computeScratchRevenue = (totalSold: number, amount: number): number =>
  toMoney(Math.max(0, totalSold) * Math.max(0, amount));

export const computeTotalScratchRevenue = (
  lines: Array<{ revenue?: number; totalSold?: number; amount?: number }>
) =>
  toMoney(
    lines.reduce((sum, line) => {
      if (Number.isFinite(line.revenue)) {
        return sum + Math.max(0, Number(line.revenue ?? 0));
      }
      return sum + computeScratchRevenue(Number(line.totalSold ?? 0), Number(line.amount ?? 0));
    }, 0)
  );

export const computeLotteryAmountDue = (
  totalScratchRevenue: number,
  paidOut: number,
  online: number
) => toMoney(Math.max(0, totalScratchRevenue) - Math.max(0, paidOut) + Math.max(0, online));

// Backward-compatible wrapper used in existing modules/tests.
export const computeTicketsSold = ({
  startNumber,
  endNumber,
  manualOverride
}: ComputeTicketsSoldInput): number => {
  if (manualOverride !== undefined && manualOverride !== null) {
    return Math.max(0, toWhole(manualOverride));
  }
  return computeScratchSold(startNumber, endNumber);
};

// Backward-compatible wrapper used in existing modules/tests.
export const computeLotterySales = ({
  ticketsSold,
  ticketPrice
}: {
  ticketsSold: number;
  ticketPrice: number;
}) => computeScratchRevenue(ticketsSold, ticketPrice);

export const computeLotteryNet = ({
  salesAmount,
  payouts
}: {
  salesAmount: number;
  payouts: number;
}) => toMoney(Math.max(0, salesAmount) - Math.max(0, payouts));

export const validateLotteryRange = ({
  startNumber,
  endNumber,
  bundleSize
}: ValidateLotteryRangeInput): ValidateLotteryRangeResult => {
  if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber)) {
    return {
      isValid: false,
      error: "Start and end numbers must be whole numbers.",
      ticketsSold: 0
    };
  }

  if (startNumber < 0 || endNumber < 0) {
    return {
      isValid: false,
      error: "Start and end numbers must be 0 or higher.",
      ticketsSold: 0
    };
  }

  if (endNumber > startNumber) {
    return {
      isValid: false,
      error: "End number cannot be higher than start number.",
      ticketsSold: 0
    };
  }

  const ticketsSold = computeScratchSold(startNumber, endNumber);

  if (bundleSize > 0 && ticketsSold > bundleSize) {
    return {
      isValid: true,
      warning: "Tickets sold is higher than the configured bundle size.",
      ticketsSold
    };
  }

  return {
    isValid: true,
    ticketsSold
  };
};

