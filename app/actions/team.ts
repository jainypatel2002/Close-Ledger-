"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { memberUpdateSchema } from "@/lib/validation/closing";

const inviteSchema = z.object({
  store_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "STAFF"]),
  permissions: z.record(z.boolean()).default({})
});

export const upsertStoreMemberAction = async (
  values: z.infer<typeof memberUpdateSchema>
) => {
  const context = await requireAdmin();
  if (context.activeStore?.id !== values.store_id) {
    throw new Error("Cannot manage a different store.");
  }

  const payload = memberUpdateSchema.parse(values);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("store_members").upsert(
    {
      store_id: payload.store_id,
      user_id: payload.user_id,
      role: payload.role,
      is_active: payload.is_active,
      permissions: payload.permissions
    },
    { onConflict: "store_id,user_id" }
  );

  if (error) {
    throw error;
  }

  revalidatePath("/team");
};

export const inviteStoreMemberAction = async (
  values: z.infer<typeof inviteSchema>
) => {
  const context = await requireAdmin();
  const payload = inviteSchema.parse(values);
  if (context.activeStore?.id !== payload.store_id) {
    throw new Error("Cannot invite users to another store.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: profileError } = await supabase
    .from("user_profiles")
    .select("id,email")
    .eq("email", payload.email.toLowerCase())
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }
  if (!data) {
    throw new Error(
      "User profile not found. Ask the staff member to create an account first."
    );
  }

  await supabase
    .from("user_profiles")
    .update({ full_name: payload.full_name, email: payload.email.toLowerCase() })
    .eq("id", data.id);

  const { error } = await supabase.from("store_members").upsert(
    {
      store_id: payload.store_id,
      user_id: data.id,
      role: payload.role,
      is_active: true,
      permissions: payload.permissions
    },
    { onConflict: "store_id,user_id" }
  );

  if (error) {
    throw error;
  }

  revalidatePath("/team");
};
