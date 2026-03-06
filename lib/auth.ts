import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Store, StoreMember } from "@/lib/types";

export interface SessionContext {
  userId: string;
  activeStore: Store | null;
  membership: StoreMember | null;
  stores: Store[];
}

const ACTIVE_STORE_COOKIE = "active_store_id";

export const getActiveStoreCookie = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
};

export const setActiveStoreCookie = async (storeId: string) => {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
};

export const getSessionContext = async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("store_members")
    .select(
      "id,store_id,user_id,role,is_active,permissions,last_active_at,created_at,updated_at,stores(*)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (membershipError) {
    throw membershipError;
  }

  const stores = (memberships ?? [])
    .map((item) => {
      const relatedStore = Array.isArray(item.stores) ? item.stores[0] : item.stores;
      return (relatedStore ?? null) as Store | null;
    })
    .filter((store): store is Store => Boolean(store));

  const activeStoreIdCookie = await getActiveStoreCookie();
  const resolvedStore =
    stores.find((store) => store.id === activeStoreIdCookie) ?? stores[0] ?? null;
  const membership =
    memberships?.find((item) => item.store_id === resolvedStore?.id) ?? null;

  if (membership?.id) {
    await supabase
      .from("store_members")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", membership.id);
  }

  return {
    userId: user.id,
    activeStore: resolvedStore,
    membership: membership as StoreMember | null,
    stores
  };
};

export const requireSessionContext = async (): Promise<SessionContext> => {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }
  return context;
};

export const requireAdmin = async (reason = "admin"): Promise<SessionContext> => {
  const context = await requireSessionContext();
  if (context.membership?.role !== "ADMIN") {
    redirect(`/forbidden?reason=${encodeURIComponent(reason)}`);
  }
  return context;
};
