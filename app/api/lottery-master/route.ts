import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { lotteryMasterEntrySchema } from "@/lib/validation/lottery-master";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "Missing storeId." }, { status: 400 });
    }

    const membership = await getMembershipForStore(storeId);
    if (!membership) {
      return NextResponse.json({ error: "No store access." }, { status: 403 });
    }

    const onlyActive = request.nextUrl.searchParams.get("activeOnly") === "1";
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("lottery_master_entries")
      .select("*")
      .eq("store_id", storeId)
      .order("display_number", { ascending: true });

    if (membership.role !== "ADMIN" || onlyActive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load lottery setup." },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await request.json();
    const payload = lotteryMasterEntrySchema.parse(body);

    const membership = await getMembershipForStore(payload.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: existingByNumber, error: existingByNumberError } = await supabase
      .from("lottery_master_entries")
      .select("id")
      .eq("store_id", payload.store_id)
      .eq("display_number", payload.display_number)
      .maybeSingle();
    if (existingByNumberError) {
      throw existingByNumberError;
    }
    if (existingByNumber) {
      return NextResponse.json(
        { error: "Lottery number already exists for this store." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("lottery_master_entries")
      .insert({
        store_id: payload.store_id,
        display_number: payload.display_number,
        name: payload.name,
        ticket_price: payload.ticket_price,
        default_bundle_size: payload.default_bundle_size,
        is_active: payload.is_active,
        is_locked: payload.is_locked,
        notes: payload.notes ?? null,
        created_by_app_user_id: user.id,
        updated_by_app_user_id: user.id
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error("Failed to create lottery entry.");
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create lottery entry." },
      { status: 400 }
    );
  }
}
