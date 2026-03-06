import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { canDeleteClosing } from "@/lib/server/closing-permissions";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const supabase = await createSupabaseServerClient();
    const { data: closing } = await supabase
      .from("closing_days")
      .select("id,store_id")
      .eq("id", id)
      .maybeSingle();
    if (!closing) {
      return NextResponse.json({ error: "Closing not found." }, { status: 404 });
    }
    const membership = await getMembershipForStore(closing.store_id);
    if (!membership || !canDeleteClosing(membership.role)) {
      return NextResponse.json(
        { error: "Only admin can delete closing records." },
        { status: 403 }
      );
    }
    const { error } = await supabase.from("closing_days").delete().eq("id", id);
    if (error) {
      throw error;
    }
    await supabase.from("audit_log").insert({
      store_id: closing.store_id,
      closing_day_id: closing.id,
      table_name: "closing_days",
      row_id: closing.id,
      action_type: "DELETE",
      actor_id: user.id,
      reason: "Deleted by admin"
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete closing." },
      { status: 400 }
    );
  }
}
