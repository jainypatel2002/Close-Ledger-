"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireSessionContext, setActiveStoreCookie } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { storeProfileSchema } from "@/lib/validation/closing";

const storePayloadSchema = storeProfileSchema.extend({
  id: z.string().uuid().optional()
});

export const createStoreAction = async (values: z.infer<typeof storeProfileSchema>) => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const payload = storePayloadSchema.parse(values);
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .insert({
      ...payload,
      owner_id: user.id
    })
    .select("*")
    .single();

  if (storeError || !store) {
    throw storeError ?? new Error("Store creation failed.");
  }

  const { error: memberError } = await supabase.from("store_members").upsert(
    {
      store_id: store.id,
      user_id: user.id,
      role: "ADMIN",
      permissions: {
        can_create_closing: true,
        can_view_history: true,
        can_print_pdf: true,
        can_view_reports: true,
        can_export_data: true,
        can_view_only_own_entries: false
      },
      is_active: true
    },
    { onConflict: "store_id,user_id" }
  );

  if (memberError) {
    throw memberError;
  }

  await setActiveStoreCookie(store.id);
  revalidatePath("/", "layout");
};

export const updateStoreAction = async (
  storeId: string,
  values: z.infer<typeof storeProfileSchema>
) => {
  const context = await requireAdmin();
  const payload = storePayloadSchema.parse({ ...values, id: storeId });
  const { id: _id, ...storeValues } = payload;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("stores")
    .update({
      ...storeValues
    })
    .eq("id", storeId)
    .eq("id", context.activeStore?.id ?? storeId);

  if (error) {
    throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
};

export const switchStoreAction = async (storeId: string) => {
  await requireSessionContext();
  await setActiveStoreCookie(storeId);
  revalidatePath("/", "layout");
};

export const deleteActiveStoreAction = async () => {
  const context = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  if (!context.activeStore) {
    throw new Error("No active store selected.");
  }
  const { error } = await supabase.from("stores").delete().eq("id", context.activeStore.id);
  if (error) {
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/setup");
};
