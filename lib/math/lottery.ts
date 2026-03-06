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

export const computeTicketsSold = ({
  startNumber,
  endNumber,
  inclusiveCount,
  manualOverride
}: ComputeTicketsSoldInput): number => {
  if (manualOverride !== undefined && manualOverride !== null) {
    return Math.max(0, Math.floor(manualOverride));
  }

  const safeStart = Number.isFinite(startNumber) ? Math.floor(startNumber) : 0;
  const safeEnd = Number.isFinite(endNumber) ? Math.floor(endNumber) : 0;
  const diff = safeEnd - safeStart;

  if (diff < 0) {
    return 0;
  }

  const sold = inclusiveCount ? diff + 1 : diff;
  return Math.max(0, sold);
};

export const computeLotterySales = ({
  ticketsSold,
  ticketPrice
}: {
  ticketsSold: number;
  ticketPrice: number;
}) => toMoney(Math.max(0, ticketsSold) * Math.max(0, ticketPrice));

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
  inclusiveCount,
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

  if (endNumber < startNumber) {
    return {
      isValid: false,
      error: "End number cannot be lower than start number.",
      ticketsSold: 0
    };
  }

  const ticketsSold = computeTicketsSold({
    startNumber,
    endNumber,
    inclusiveCount
  });

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
