import { z } from "zod";

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
