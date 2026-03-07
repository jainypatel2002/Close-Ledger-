import { LotteryMasterEntry } from "@/lib/types";

export interface LotteryMasterFormState {
  id?: string;
  display_number: string;
  name: string;
  ticket_price: string;
  default_bundle_size: string;
  is_active: boolean;
  is_locked: boolean;
  notes: string;
}

export interface ParsedLotteryMasterFormValues {
  id?: string;
  display_number: number;
  name: string;
  ticket_price: number;
  default_bundle_size: number;
  is_active: boolean;
  is_locked: boolean;
  notes: string | null;
}

interface CreateLotteryMasterFormStateArgs {
  entry?: LotteryMasterEntry;
  nextDisplayNumber: number;
  defaultBundleSize: number;
  defaultLocked?: boolean;
  defaultActive?: boolean;
}

type ParsedNumericField = { value: number } | { error: string };

const parsePositiveInteger = ({
  rawValue,
  label
}: {
  rawValue: string;
  label: string;
}): ParsedNumericField => {
  const value = rawValue.trim();
  if (!value) {
    return { error: `${label} is required.` };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: `${label} must be a whole number greater than 0.` };
  }
  return { value: parsed };
};

const parseNonNegativeNumber = ({
  rawValue,
  label
}: {
  rawValue: string;
  label: string;
}): ParsedNumericField => {
  const value = rawValue.trim();
  if (!value) {
    return { error: `${label} is required.` };
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return { error: `${label} must be a valid number.` };
  }
  if (parsed < 0) {
    return { error: `${label} must be 0 or more.` };
  }
  return { value: parsed };
};

export const createLotteryMasterFormState = ({
  entry,
  nextDisplayNumber,
  defaultBundleSize,
  defaultLocked = false,
  defaultActive = true
}: CreateLotteryMasterFormStateArgs): LotteryMasterFormState => {
  if (entry) {
    return {
      id: entry.id,
      display_number: String(entry.display_number),
      name: entry.name,
      ticket_price: String(entry.ticket_price),
      default_bundle_size: String(entry.default_bundle_size),
      is_active: entry.is_active,
      is_locked: entry.is_locked,
      notes: entry.notes ?? ""
    };
  }

  return {
    display_number: String(nextDisplayNumber),
    name: "",
    ticket_price: "0",
    default_bundle_size: String(defaultBundleSize),
    is_active: defaultActive,
    is_locked: defaultLocked,
    notes: ""
  };
};

export const parseLotteryMasterFormState = (
  form: LotteryMasterFormState
):
  | { ok: true; data: ParsedLotteryMasterFormValues }
  | { ok: false; error: string } => {
  const trimmedName = form.name.trim();
  if (!trimmedName) {
    return { ok: false, error: "Lottery name is required." };
  }

  const displayNumber = parsePositiveInteger({
    rawValue: form.display_number,
    label: "Lottery number"
  });
  if ("error" in displayNumber) {
    return { ok: false, error: displayNumber.error };
  }

  const ticketPrice = parseNonNegativeNumber({
    rawValue: form.ticket_price,
    label: "Amount"
  });
  if ("error" in ticketPrice) {
    return { ok: false, error: ticketPrice.error };
  }

  const defaultBundleSize = parsePositiveInteger({
    rawValue: form.default_bundle_size,
    label: "Default bundle size"
  });
  if ("error" in defaultBundleSize) {
    return { ok: false, error: defaultBundleSize.error };
  }

  return {
    ok: true,
    data: {
      id: form.id,
      display_number: displayNumber.value,
      name: trimmedName,
      ticket_price: ticketPrice.value,
      default_bundle_size: defaultBundleSize.value,
      is_active: Boolean(form.is_active),
      is_locked: Boolean(form.is_locked),
      notes: form.notes.trim() || null
    }
  };
};
