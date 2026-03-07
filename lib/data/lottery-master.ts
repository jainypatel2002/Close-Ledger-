import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseMissingTableError } from "@/lib/supabase/errors";
import { LotteryMasterEntry } from "@/lib/types";

export const getLotteryMasterEntriesForStore = async ({
  storeId,
  onlyActive = false,
  includeArchived = false
}: {
  storeId: string;
  onlyActive?: boolean;
  includeArchived?: boolean;
}): Promise<LotteryMasterEntry[]> => {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("lottery_master_entries")
    .select("*")
    .eq("store_id", storeId)
    .order("display_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (onlyActive) {
    query = query.eq("is_active", true);
    query = query.eq("is_archived", false);
  } else if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error) {
    if (isSupabaseMissingTableError(error, "lottery_master_entries")) {
      return [];
    }
    throw error;
  }
  return (data ?? []) as LotteryMasterEntry[];
};
