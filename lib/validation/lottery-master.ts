import { z } from "zod";
import { nonNegativeMoneySchema } from "@/lib/validation/closing";

export const lotteryMasterEntrySchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  display_number: z.number().int().min(1),
  name: z.string().min(1).max(120),
  ticket_price: nonNegativeMoneySchema,
  default_bundle_size: z.number().int().min(1).max(1000).default(100),
  is_active: z.boolean().default(true),
  is_locked: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable()
});

export const lotteryMasterPatchSchema = lotteryMasterEntrySchema
  .omit({ store_id: true })
  .partial()
  .extend({ id: z.string().uuid().optional() });

export type LotteryMasterEntryValues = z.infer<typeof lotteryMasterEntrySchema>;
