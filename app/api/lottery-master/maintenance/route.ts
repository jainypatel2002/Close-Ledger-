import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import {
  buildLotteryMaintenancePlan,
  LotteryMaintenanceEntry,
  LotteryMaintenanceMode
} from "@/lib/server/lottery-master-maintenance";

const maintenanceSchema = z.object({
  store_id: z.string().uuid(),
  action: z.enum(["clean_duplicates", "reset_setup"])
});

const buildReferenceCountMap = ({
  rows
}: {
  rows: Array<{ lottery_master_entry_id: string | null }>;
}) => {
  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    if (!row.lottery_master_entry_id) {
      return;
    }
    counts[row.lottery_master_entry_id] = (counts[row.lottery_master_entry_id] ?? 0) + 1;
  });
  return counts;
};

const actionTypeForRun = (mode: LotteryMaintenanceMode) =>
  mode === "reset_setup" ? "lottery_reset_run" : "lottery_cleanup_run";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = maintenanceSchema.parse(await request.json());
    const membership = await getMembershipForStore(payload.store_id);
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();

    const { data: rows, error: rowsError } = await supabase
      .from("lottery_master_entries")
      .select("id,store_id,display_number,name,is_active,is_archived,created_at,updated_at")
      .eq("store_id", payload.store_id)
      .order("created_at", { ascending: true });
    if (rowsError) {
      throw rowsError;
    }

    const entries = (rows ?? []) as LotteryMaintenanceEntry[];
    const entryIds = entries.map((entry) => entry.id);

    let referenceCounts: Record<string, number> = {};
    if (entryIds.length > 0) {
      const { data: references, error: referencesError } = await supabase
        .from("lottery_scratch_lines")
        .select("lottery_master_entry_id")
        .eq("store_id", payload.store_id)
        .in("lottery_master_entry_id", entryIds);
      if (referencesError) {
        throw referencesError;
      }
      referenceCounts = buildReferenceCountMap({
        rows: (references ?? []) as Array<{ lottery_master_entry_id: string | null }>
      });
    }

    const plan = buildLotteryMaintenancePlan({
      entries,
      referenceCounts,
      mode: payload.action
    });

    const now = new Date().toISOString();
    const archivedIds: string[] = [];
    const deletedIds: string[] = [];

    for (const action of plan.actions) {
      if (action.action === "DELETE") {
        const { error } = await supabase
          .from("lottery_master_entries")
          .delete()
          .eq("id", action.entry_id)
          .eq("store_id", payload.store_id);
        if (error) {
          throw error;
        }
        deletedIds.push(action.entry_id);
        continue;
      }

      const { error } = await supabase
        .from("lottery_master_entries")
        .update({
          is_archived: true,
          is_active: false,
          archived_at: now,
          archived_by_app_user_id: user.id,
          updated_by_app_user_id: user.id
        })
        .eq("id", action.entry_id)
        .eq("store_id", payload.store_id)
        .eq("is_archived", false);
      if (error) {
        throw error;
      }
      archivedIds.push(action.entry_id);
    }

    const { data: refreshedRows, error: refreshedError } = await supabase
      .from("lottery_master_entries")
      .select("*")
      .eq("store_id", payload.store_id)
      .order("display_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (refreshedError) {
      throw refreshedError;
    }

    const summary = {
      action: payload.action,
      scanned_count: plan.scanned_count,
      duplicate_groups: plan.duplicate_groups,
      invalid_rows: plan.invalid_rows,
      actions_count: plan.actions.length,
      archived_count: archivedIds.length,
      deleted_count: deletedIds.length,
      affected_lottery_ids: [...archivedIds, ...deletedIds],
      archived_ids: archivedIds,
      deleted_ids: deletedIds,
      kept_ids: plan.kept_ids,
      ran_at: now
    };

    const auditRows: Array<Record<string, unknown>> = [
      {
        store_id: payload.store_id,
        table_name: "lottery_master_entries",
        row_id: null,
        action_type: actionTypeForRun(payload.action),
        actor_id: user.id,
        reason: `${payload.action} executed`,
        before_data: null,
        after_data: summary
      }
    ];

    deletedIds.forEach((id) => {
      auditRows.push({
        store_id: payload.store_id,
        table_name: "lottery_master_entries",
        row_id: id,
        action_type: "duplicate_lottery_removed",
        actor_id: user.id,
        reason: payload.action,
        before_data: null,
        after_data: {
          action: payload.action,
          row_id: id
        }
      });
    });

    archivedIds.forEach((id) => {
      auditRows.push({
        store_id: payload.store_id,
        table_name: "lottery_master_entries",
        row_id: id,
        action_type: "lottery_master_archived",
        actor_id: user.id,
        reason: payload.action,
        before_data: null,
        after_data: {
          action: payload.action,
          row_id: id
        }
      });
    });

    const { error: auditError } = await supabase.from("audit_log").insert(auditRows);
    if (auditError) {
      throw auditError;
    }

    return NextResponse.json({
      data: refreshedRows ?? [],
      summary
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run lottery maintenance for this store."
      },
      { status: 400 }
    );
  }
}
