import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { lotteryMasterPatchSchema } from "@/lib/validation/lottery-master";
import {
  findUsableLotteryConflicts,
  isLotteryUsable,
  LotteryIdentityLike
} from "@/lib/lottery/master-rules";
import {
  getSupabaseConstraintName,
  isSupabaseUniqueViolation
} from "@/lib/supabase/errors";

const DUPLICATE_DISPLAY_CONSTRAINT = "idx_lottery_master_store_display_active_unique";
const DUPLICATE_NAME_CONSTRAINT = "idx_lottery_master_store_name_active_unique";

const resolveLotteryConflictError = (error: unknown) => {
  if (!isSupabaseUniqueViolation(error)) {
    return null;
  }

  const constraint = getSupabaseConstraintName(error);
  if (constraint === DUPLICATE_DISPLAY_CONSTRAINT) {
    return {
      body: { error: "Lottery number already exists among active lotteries for this store." },
      status: 409
    };
  }

  if (constraint === DUPLICATE_NAME_CONSTRAINT) {
    return {
      body: { error: "Lottery name already exists among active lotteries for this store." },
      status: 409
    };
  }

  return {
    body: { error: "An active lottery with the same identity already exists." },
    status: 409
  };
};

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
      .select("id,store_id,display_number,name,is_active,is_archived")
      .eq("id", id)
      .single();
    if (existingError || !existing) {
      return NextResponse.json({ error: "Lottery entry not found." }, { status: 404 });
    }

    const membership = await getMembershipForStore(existing.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    const nextDisplayNumber =
      payload.display_number === undefined ? existing.display_number : payload.display_number;
    const nextName = (payload.name === undefined ? existing.name : payload.name).trim();
    if (payload.name !== undefined && !nextName) {
      return NextResponse.json({ error: "Lottery name is required." }, { status: 400 });
    }
    const nextIsArchived = Boolean(existing.is_archived);
    const nextIsActive = payload.is_active === undefined ? Boolean(existing.is_active) : payload.is_active;

    if (nextIsArchived && nextIsActive) {
      return NextResponse.json(
        { error: "Archived lotteries cannot be activated. Restore from admin maintenance first." },
        { status: 409 }
      );
    }

    if (nextIsActive && !nextIsArchived) {
      const { data: activeEntries, error: activeEntriesError } = await supabase
        .from("lottery_master_entries")
        .select("id,display_number,name,is_active,is_archived")
        .eq("store_id", existing.store_id)
        .eq("is_active", true)
        .eq("is_archived", false)
        .neq("id", id)
        .order("created_at", { ascending: true });
      if (activeEntriesError) {
        throw activeEntriesError;
      }

      const { numberConflict, nameConflict } = findUsableLotteryConflicts(
        ((activeEntries ?? []) as LotteryIdentityLike[]).filter((entry) => isLotteryUsable(entry)),
        {
          displayNumber: nextDisplayNumber,
          name: nextName,
          excludeId: id
        }
      );

      if (numberConflict) {
        return NextResponse.json(
          { error: "Lottery number already exists among active lotteries for this store." },
          { status: 409 }
        );
      }
      if (nameConflict) {
        return NextResponse.json(
          { error: "Lottery name already exists among active lotteries for this store." },
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
      updateData.name = nextName;
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
      const resolved = resolveLotteryConflictError(error);
      if (resolved) {
        return NextResponse.json(resolved.body, { status: resolved.status });
      }
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

    const { count: referencesCount, error: referencesError } = await supabase
      .from("lottery_scratch_lines")
      .select("id", { count: "exact", head: true })
      .eq("store_id", existing.store_id)
      .eq("lottery_master_entry_id", id);
    if (referencesError) {
      throw referencesError;
    }

    if ((referencesCount ?? 0) > 0) {
      const now = new Date().toISOString();
      const { data: archived, error: archiveError } = await supabase
        .from("lottery_master_entries")
        .update({
          is_archived: true,
          is_active: false,
          archived_at: now,
          archived_by_app_user_id: user.id,
          updated_by_app_user_id: user.id
        })
        .eq("id", id)
        .eq("store_id", existing.store_id)
        .select("*")
        .single();
      if (archiveError) {
        throw archiveError;
      }
      return NextResponse.json({
        ok: true,
        action: "archived",
        reference_count: referencesCount ?? 0,
        data: archived
      });
    }

    const { error: deleteError } = await supabase
      .from("lottery_master_entries")
      .delete()
      .eq("id", id)
      .eq("store_id", existing.store_id);
    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ ok: true, action: "deleted", reference_count: 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete lottery entry." },
      { status: 400 }
    );
  }
}
