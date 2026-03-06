import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePermissions } from "@/lib/permissions";
import { ClosingStatus, Role } from "@/lib/types";

export const getCurrentUser = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  return user;
};

export const getMembershipForStore = async (storeId: string) => {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("store_members")
    .select("id,store_id,user_id,role,is_active,permissions")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...data,
    permissions: normalizePermissions(data.role as Role, data.permissions ?? {})
  };
};

export const canStaffEditStatus = ({
  role,
  existingStatus
}: {
  role: Role;
  existingStatus: ClosingStatus;
}) => {
  if (role === "ADMIN") {
    return true;
  }
  return existingStatus === "DRAFT";
};
