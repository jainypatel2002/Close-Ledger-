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

    const { data, error } = await supabase
      .from("lottery_master_entries")
      .update({
        ...payload,
        notes: payload.notes ?? null,
        updated_by_app_user_id: user.id
      })
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
