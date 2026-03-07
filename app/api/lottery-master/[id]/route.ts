import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { lotteryMasterPatchSchema } from "@/lib/validation/lottery-master";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const payload = lotteryMasterPatchSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("lottery_master_entries")
      .select("id,store_id")
      .eq("id", id)
      .single();
    if (existingError || !existing) {
      return NextResponse.json({ error: "Lottery entry not found." }, { status: 404 });
    }

    const membership = await getMembershipForStore(existing.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    if (payload.display_number !== undefined) {
      const { data: conflictingEntry, error: conflictingEntryError } = await supabase
        .from("lottery_master_entries")
        .select("id")
        .eq("store_id", existing.store_id)
        .eq("display_number", payload.display_number)
        .neq("id", id)
        .maybeSingle();
      if (conflictingEntryError) {
        throw conflictingEntryError;
      }
      if (conflictingEntry) {
        return NextResponse.json(
          { error: "Lottery number already exists for this store." },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      updated_by_app_user_id: user.id
    };
    if (payload.display_number !== undefined) {
      updateData.display_number = payload.display_number;
    }
    if (payload.name !== undefined) {
      updateData.name = payload.name;
    }
    if (payload.ticket_price !== undefined) {
      updateData.ticket_price = payload.ticket_price;
    }
    if (payload.default_bundle_size !== undefined) {
      updateData.default_bundle_size = payload.default_bundle_size;
    }
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }
    if (payload.is_locked !== undefined) {
      updateData.is_locked = payload.is_locked;
    }
    if ("notes" in payload) {
      updateData.notes = payload.notes ?? null;
    }

    const { data, error } = await supabase
      .from("lottery_master_entries")
      .update(updateData)
      .eq("id", id)
      .eq("store_id", existing.store_id)
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error("Failed to update lottery entry.");
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update lottery entry." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: existingError } = await supabase
      .from("lottery_master_entries")
      .select("id,store_id")
      .eq("id", id)
      .single();
    if (existingError || !existing) {
      return NextResponse.json({ error: "Lottery entry not found." }, { status: 404 });
    }

    const membership = await getMembershipForStore(existing.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    const { error } = await supabase
      .from("lottery_master_entries")
      .delete()
      .eq("id", id)
      .eq("store_id", existing.store_id);
    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete lottery entry." },
      { status: 400 }
    );
  }
}
