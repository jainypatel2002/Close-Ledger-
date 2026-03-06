"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setActiveStoreCookie } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const setActiveStore = async (storeId: string) => {
  await setActiveStoreCookie(storeId);
  revalidatePath("/", "layout");
};

export const signOut = async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
};
