import { z, ZodError } from "zod";

export const nonNegativeMoneySchema = z
  .number({ invalid_type_error: "Must be a number." })
  .min(0, "Must be 0 or more.");

export const closingStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "FINALIZED",
  "LOCKED"
]);

export const taxModeSchema = z.enum(["AUTO", "MANUAL"]);
export const paymentTypeSchema = z.enum(["cash", "card", "ebt", "other"]);

export const categoryLineSchema = z.object({
  id: z.string().uuid(),
  category_name: z.string().min(1).max(120),
  amount: nonNegativeMoneySchema,
  taxable: z.boolean()
});

export const lotteryLineSchema = z.object({
  id: z.string().uuid(),
  lottery_master_entry_id: z.string().uuid().nullable().optional(),
  lottery_number_snapshot: z.number().int().min(1).optional(),
  display_number_snapshot: z.number().int().min(1).optional(),
  lottery_name_snapshot: z.string().min(1).max(120).optional(),
  amount_snapshot: nonNegativeMoneySchema.optional(),
  ticket_price_snapshot: nonNegativeMoneySchema.optional(),
  bundle_size_snapshot: z.number().int().positive().max(1000).optional(),
  is_locked_snapshot: z.boolean().default(false),
  game_name: z.string().max(120).optional(),
  pack_id: z.string().max(60).optional().or(z.literal("")),
  start_number: z.number().int().min(0).optional(),
  end_number: z.number().int().min(0).optional(),
  start_ticket_number: z.number().int().min(0).optional(),
  end_ticket_number: z.number().int().min(0).optional(),
  inclusive_count: z.boolean().default(false),
  bundle_size: z.number().int().positive().max(1000).optional(),
  ticket_price: nonNegativeMoneySchema.optional(),
  tickets_sold_override: z.number().int().min(0).nullable().optional(),
  override_reason: z.string().max(250).optional().or(z.literal("")).nullable(),
  manual_override_reason: z.string().max(250).optional().or(z.literal("")),
  payouts: nonNegativeMoneySchema.optional(),
  scratch_payouts: nonNegativeMoneySchema.optional()
});

export const billpayLineSchema = z.object({
  id: z.string().uuid(),
  provider_name: z.string().min(1).max(120),
  amount_collected: nonNegativeMoneySchema,
  fee_revenue: nonNegativeMoneySchema,
  txn_count: z.number().int().min(0).max(100000)
});

export const paymentLineSchema = z.object({
  id: z.string().uuid(),
  payment_type: paymentTypeSchema,
  label: z.string().min(1).max(120),
  amount: nonNegativeMoneySchema,
  sort_order: z.number().int().min(0).max(100000)
});

export const closingFormSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
  status: closingStatusSchema,
  tax_mode: taxModeSchema,
  tax_rate_used: z.number().min(0).max(1),
  tax_override_enabled: z.boolean().default(false),
  tax_amount_manual: nonNegativeMoneySchema.nullable().optional(),
  lottery_total_scratch_revenue: nonNegativeMoneySchema,
  lottery_online_amount: nonNegativeMoneySchema,
  lottery_paid_out_amount: nonNegativeMoneySchema,
  lottery_amount_due: z.number({ invalid_type_error: "Must be a number." }),
  draw_sales: nonNegativeMoneySchema,
  draw_payouts: nonNegativeMoneySchema,
  cash_amount: nonNegativeMoneySchema,
  card_amount: nonNegativeMoneySchema,
  ebt_amount: nonNegativeMoneySchema,
  other_amount: nonNegativeMoneySchema,
  notes: z.string().max(2000).optional(),
  include_billpay_in_gross: z.boolean().default(true),
  include_lottery_in_gross: z.boolean().default(true),
  category_lines: z.array(categoryLineSchema),
  lottery_lines: z.array(lotteryLineSchema),
  billpay_lines: z.array(billpayLineSchema),
  payment_lines: z.array(paymentLineSchema),
  reopen_reason: z.string().max(200).optional()
});

export const storeProfileSchema = z.object({
  store_name: z.string().min(1).max(180),
  legal_name: z.string().max(180).optional().or(z.literal("")),
  address_line1: z.string().min(1).max(180),
  address_line2: z.string().max(180).optional().or(z.literal("")),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(40),
  zip: z.string().min(3).max(12),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  header_text: z.string().max(180).optional().or(z.literal("")),
  tax_rate_default: z.number().min(0).max(1),
  timezone: z.string().min(1).max(80),
  scratch_bundle_size_default: z.number().int().min(1).max(1000),
  include_billpay_in_gross: z.boolean().default(true),
  include_lottery_in_gross: z.boolean().default(true),
  allow_staff_view_history: z.boolean().default(false),
  allow_staff_print_pdf: z.boolean().default(false),
  allow_staff_export: z.boolean().default(false)
});

export const memberUpdateSchema = z.object({
  store_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["ADMIN", "STAFF"]),
  is_active: z.boolean(),
  permissions: z.record(z.boolean()).default({})
});

export type ClosingFormValues = z.infer<typeof closingFormSchema>;
export type StoreProfileValues = z.infer<typeof storeProfileSchema>;

type ClosingFormInput = Omit<
  Partial<ClosingFormValues>,
  "category_lines" | "lottery_lines" | "billpay_lines" | "payment_lines"
> & {
  category_lines?: Array<Partial<ClosingFormValues["category_lines"][number]>>;
  lottery_lines?: Array<Partial<ClosingFormValues["lottery_lines"][number]>>;
  billpay_lines?: Array<Partial<ClosingFormValues["billpay_lines"][number]>>;
  payment_lines?: Array<Partial<ClosingFormValues["payment_lines"][number]>>;
};

const paymentTypeLabel = (paymentType: unknown) => {
  const value = String(paymentType ?? "other").toLowerCase();
  if (value === "ebt") {
    return "EBT";
  }
  if (value === "cash" || value === "card" || value === "other") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return "Payment";
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const describeIssuePath = (path: (string | number)[]) => {
  const [root, index, field] = path;
  if (root === "payment_lines") {
    const label = typeof index === "number" ? `payment line ${index + 1}` : "payment line";
    if (field === "id") {
      return `${label} metadata`;
    }
    if (field === "label") {
      return `${label} label`;
    }
    if (field === "amount") {
      return `${label} amount`;
    }
    return label;
  }
  if (root === "billpay_lines") {
    const label = typeof index === "number" ? `billpay line ${index + 1}` : "billpay line";
    if (field === "id") {
      return `${label} metadata`;
    }
    if (field === "provider_name") {
      return `${label} provider`;
    }
    return label;
  }
  if (root === "lottery_lines") {
    const label = typeof index === "number" ? `lottery line ${index + 1}` : "lottery line";
    if (field === "id") {
      return `${label} metadata`;
    }
    if (field === "start_number") {
      return `${label} start number`;
    }
    if (field === "end_number") {
      return `${label} end number`;
    }
    return label;
  }
  if (root === "category_lines") {
    const label = typeof index === "number" ? `sales line ${index + 1}` : "sales line";
    if (field === "id") {
      return `${label} metadata`;
    }
    if (field === "amount") {
      return `${label} amount`;
    }
    return label;
  }

  const labels: Record<string, string> = {
    id: "closing ID",
    store_id: "store",
    business_date: "business date",
    status: "status",
    tax_mode: "tax mode",
    tax_rate_used: "tax rate",
    lottery_total_scratch_revenue: "scratch revenue",
    lottery_online_amount: "lottery online amount",
    lottery_paid_out_amount: "lottery paid out amount",
    lottery_amount_due: "lottery amount due",
    draw_sales: "draw sales",
    draw_payouts: "draw payouts",
    cash_amount: "cash amount",
    card_amount: "card amount",
    ebt_amount: "EBT amount",
    other_amount: "other amount",
    notes: "notes"
  };

  const key = typeof root === "string" ? root : String(root ?? "field");
  return labels[key] ?? key.replaceAll("_", " ");
};

const formatIssuePathForLogs = (path: (string | number)[]) =>
  path.length === 0 ? "root" : path.map((segment) => String(segment)).join(".");

export const formatClosingValidationError = (error: ZodError) => {
  const [issue] = error.issues;
  if (!issue) {
    return "Please review the closing details and try again.";
  }
  const subject = describeIssuePath(issue.path);
  if (issue.path.at(-1) === "id" && issue.message === "Required") {
    return `${subject} is missing. Refresh the page and try again.`;
  }
  if (issue.message === "Required") {
    return `${subject} is required.`;
  }
  return `${subject}: ${issue.message}`;
};

export const formatClosingValidationDiagnostics = (error: ZodError) =>
  error.issues
    .map((issue) => `${formatIssuePathForLogs(issue.path)} => ${issue.message}`)
    .join("; ");

export const normalizeClosingFormValues = (
  values: ClosingFormInput
): ClosingFormInput => ({
  ...values,
  category_lines: Array.isArray(values.category_lines)
    ? values.category_lines.map((line) => ({
        ...line,
        id: isNonEmptyString(line.id) ? line.id : crypto.randomUUID(),
        category_name: isNonEmptyString(line.category_name)
          ? line.category_name
          : line.taxable
            ? "Taxable Sales"
            : "Non-Taxable Sales",
        amount: Number(line.amount ?? 0),
        taxable: Boolean(line.taxable)
      }))
    : values.category_lines,
  lottery_lines: Array.isArray(values.lottery_lines)
    ? values.lottery_lines.map((line, index) => ({
        ...line,
        id: isNonEmptyString(line.id) ? line.id : crypto.randomUUID(),
        display_number_snapshot:
          line.display_number_snapshot ?? line.lottery_number_snapshot ?? index + 1,
        lottery_name_snapshot:
          line.lottery_name_snapshot ?? line.game_name ?? `Lottery ${index + 1}`,
        ticket_price_snapshot: Number(line.ticket_price_snapshot ?? line.amount_snapshot ?? line.ticket_price ?? 0),
        bundle_size_snapshot: Number(line.bundle_size_snapshot ?? line.bundle_size ?? 100),
        is_locked_snapshot: Boolean(line.is_locked_snapshot),
        pack_id: line.pack_id ?? "",
        inclusive_count: Boolean(line.inclusive_count),
        manual_override_reason: String(line.manual_override_reason ?? line.override_reason ?? ""),
        payouts: Number(line.payouts ?? line.scratch_payouts ?? 0),
        scratch_payouts: Number(line.scratch_payouts ?? line.payouts ?? 0)
      }))
    : values.lottery_lines,
  billpay_lines: Array.isArray(values.billpay_lines)
    ? values.billpay_lines.map((line) => ({
        ...line,
        id: isNonEmptyString(line.id) ? line.id : crypto.randomUUID(),
        provider_name: String(line.provider_name ?? ""),
        amount_collected: Number(line.amount_collected ?? 0),
        fee_revenue: Number(line.fee_revenue ?? 0),
        txn_count: Number(line.txn_count ?? 0)
      }))
    : values.billpay_lines,
  payment_lines: Array.isArray(values.payment_lines)
    ? values.payment_lines.map((line, index) => ({
        ...line,
        id: isNonEmptyString(line.id) ? line.id : crypto.randomUUID(),
        payment_type:
          line.payment_type === "cash" ||
          line.payment_type === "card" ||
          line.payment_type === "ebt" ||
          line.payment_type === "other"
            ? line.payment_type
            : "other",
        label: isNonEmptyString(line.label)
          ? line.label
          : paymentTypeLabel(line.payment_type),
        amount: Number(line.amount ?? 0),
        sort_order: Number.isFinite(line.sort_order) ? line.sort_order : index
      }))
    : values.payment_lines
});
