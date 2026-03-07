import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { lotteryMasterEntrySchema } from "@/lib/validation/lottery-master";
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
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
    const statusFilter = request.nextUrl.searchParams.get("status");
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("lottery_master_entries")
      .select("*")
      .eq("store_id", storeId)
      .order("display_number", { ascending: true });

    if (membership.role !== "ADMIN") {
      query = query.eq("is_active", true).eq("is_archived", false);
    } else if (statusFilter === "archived") {
      query = query.eq("is_archived", true);
    } else if (statusFilter === "inactive") {
      query = query.eq("is_archived", false).eq("is_active", false);
    } else if (statusFilter === "active" || onlyActive) {
      query = query.eq("is_archived", false).eq("is_active", true);
    } else if (!includeArchived) {
      query = query.eq("is_archived", false);
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
    const normalizedName = payload.name.trim();
    if (!normalizedName) {
      return NextResponse.json({ error: "Lottery name is required." }, { status: 400 });
    }

    const membership = await getMembershipForStore(payload.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    if (payload.is_active) {
      const { data: activeEntries, error: activeEntriesError } = await supabase
        .from("lottery_master_entries")
        .select("id,display_number,name,is_active,is_archived")
        .eq("store_id", payload.store_id)
        .eq("is_active", true)
        .eq("is_archived", false);
      if (activeEntriesError) {
        throw activeEntriesError;
      }

      const { numberConflict, nameConflict } = findUsableLotteryConflicts(
        ((activeEntries ?? []) as LotteryIdentityLike[]).filter((entry) => isLotteryUsable(entry)),
        {
          displayNumber: payload.display_number,
          name: normalizedName
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

    const { data, error } = await supabase
      .from("lottery_master_entries")
      .insert({
        store_id: payload.store_id,
        display_number: payload.display_number,
        name: normalizedName,
        ticket_price: payload.ticket_price,
        default_bundle_size: payload.default_bundle_size,
        is_active: payload.is_active,
        is_archived: false,
        archived_at: null,
        archived_by_app_user_id: null,
        is_locked: payload.is_locked,
        notes: payload.notes ?? null,
        created_by_app_user_id: user.id,
        updated_by_app_user_id: user.id
      })
      .select("*")
      .single();

    if (error || !data) {
      const resolved = resolveLotteryConflictError(error);
      if (resolved) {
        return NextResponse.json(resolved.body, { status: resolved.status });
      }
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
