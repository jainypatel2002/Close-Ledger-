import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseMissingTableError } from "@/lib/supabase/errors";
import { LotteryMasterEntry } from "@/lib/types";

export const getLotteryMasterEntriesForStore = async ({
  storeId,
  onlyActive = false
}: {
  storeId: string;
  onlyActive?: boolean;
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
