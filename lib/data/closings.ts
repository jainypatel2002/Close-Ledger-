import { addDays, format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseMissingTableError } from "@/lib/supabase/errors";

export const getTodayClosingForStore = async (storeId: string) => {
  const supabase = await createSupabaseServerClient();
  const businessDate = format(new Date(), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("closing_days")
    .select("*")
    .eq("store_id", storeId)
    .eq("business_date", businessDate)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
};

export const getClosingById = async (closingId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data: closing, error } = await supabase
    .from("closing_days")
    .select("*")
    .eq("id", closingId)
    .single();

  if (error) {
    throw error;
  }

  const [categories, lottery, billpay, paymentLines, documents] = await Promise.all([
    supabase
      .from("closing_category_lines")
      .select("*")
      .eq("closing_day_id", closingId)
      .order("created_at", { ascending: true }),
    supabase
      .from("lottery_scratch_lines")
      .select("*")
      .eq("closing_day_id", closingId)
      .order("display_number_snapshot", { ascending: true }),
    supabase
      .from("billpay_lines")
      .select("*")
      .eq("closing_day_id", closingId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payment_lines")
      .select("*")
      .eq("closing_day_id", closingId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("closing_documents")
      .select("*")
      .eq("closing_day_id", closingId)
      .order("created_at", { ascending: false })
  ]);

  if (categories.error) throw categories.error;
  if (lottery.error) throw lottery.error;
  if (billpay.error) throw billpay.error;
  if (paymentLines.error && !isSupabaseMissingTableError(paymentLines.error, "payment_lines")) {
    throw paymentLines.error;
  }
  if (documents.error) throw documents.error;

  return {
    closing,
    categories: categories.data ?? [],
    lottery: lottery.data ?? [],
    billpay: billpay.data ?? [],
    paymentLines: paymentLines.data ?? [],
    documents: documents.data ?? []
  };
};

export const getClosingsForStore = async ({
  storeId,
  from,
  to
}: {
  storeId: string;
  from?: string;
  to?: string;
}) => {
  const supabase = await createSupabaseServerClient();
  const rangeStart = from ?? format(addDays(new Date(), -30), "yyyy-MM-dd");
  const rangeEnd = to ?? format(new Date(), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("closing_days")
    .select("*")
    .eq("store_id", storeId)
    .gte("business_date", rangeStart)
    .lte("business_date", rangeEnd)
    .order("business_date", { ascending: false })
    .limit(250);
  if (error) {
    throw error;
  }
  return data ?? [];
};

export const getStoreDashboardStats = async (storeId: string) => {
  const closings = await getClosingsForStore({ storeId });
  const weekWindow = addDays(new Date(), -7).toISOString().slice(0, 10);
  const monthWindow = addDays(new Date(), -30).toISOString().slice(0, 10);

  const weekTotals = closings
    .filter((item) => item.business_date >= weekWindow)
    .reduce(
      (acc, item) => {
        acc.gross += item.gross_collected ?? 0;
        acc.trueRevenue += item.true_revenue ?? 0;
        return acc;
      },
      { gross: 0, trueRevenue: 0 }
    );

  const monthTotals = closings
    .filter((item) => item.business_date >= monthWindow)
    .reduce(
      (acc, item) => {
        acc.gross += item.gross_collected ?? 0;
        acc.trueRevenue += item.true_revenue ?? 0;
        return acc;
      },
      { gross: 0, trueRevenue: 0 }
    );

  const latest = closings[0] ?? null;
  return { weekTotals, monthTotals, latest, closings };
};
