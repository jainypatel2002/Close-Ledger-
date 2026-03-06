import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getStoreMembers = async (storeId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data: members, error } = await supabase
    .from("store_members")
    .select("id,store_id,user_id,role,is_active,permissions,last_active_at,created_at,updated_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }
  const userIds = (members ?? []).map((member) => member.user_id);
  if (userIds.length === 0) {
    return [];
  }
  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id,full_name,email")
    .in("id", userIds);
  if (profileError) {
    throw profileError;
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, { full_name: profile.full_name, email: profile.email }])
  );

  return (members ?? []).map((member) => ({
    ...member,
    user_profiles: profileMap.get(member.user_id) ?? null
  }));
};

export const getAuditLogForStore = async (storeId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) {
    throw error;
  }
  return data ?? [];
};
