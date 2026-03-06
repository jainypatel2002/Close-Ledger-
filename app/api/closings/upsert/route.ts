import { NextRequest, NextResponse } from "next/server";
import { closingFormSchema } from "@/lib/validation/closing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeClosingTotals } from "@/lib/math/closing";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { canModifyExistingClosing } from "@/lib/server/closing-permissions";
import { computeSnapshotLineTotals } from "@/lib/lottery/snapshots";

interface NormalizedLotteryLine {
  id: string;
  lottery_master_entry_id: string | null;
  display_number_snapshot: number;
  lottery_name_snapshot: string;
  ticket_price_snapshot: number;
  bundle_size_snapshot: number;
  is_locked_snapshot: boolean;
  pack_id: string;
  start_number: number;
  end_number: number;
  inclusive_count: boolean;
  tickets_sold_override: number | null;
  manual_override_reason: string | null;
  payouts: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = closingFormSchema.parse(body);
    const supabase = await createSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const membership = await getMembershipForStore(parsed.store_id);
    if (!membership) {
      return NextResponse.json({ error: "No store access." }, { status: 403 });
    }
    if (membership.role === "STAFF" && !membership.permissions.can_create_closing) {
      return NextResponse.json({ error: "No permission to create closings." }, { status: 403 });
    }
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing, error: existingError } = await supabase
      .from("closing_days")
      .select("*")
      .eq("id", parsed.id)
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }

    if (existing && membership.role === "STAFF") {
      if (
        !canModifyExistingClosing({
          role: "STAFF",
          existingStatus: existing.status,
          createdBy: existing.created_by,
          userId: user.id
        }) ||
        existing.business_date !== today
      ) {
        return NextResponse.json(
          { error: "This record is locked or you do not have permission to edit it." },
          { status: 403 }
        );
      }
    }
    if (!existing && membership.role === "STAFF" && parsed.business_date !== today) {
      return NextResponse.json(
        { error: "Staff can only create closings for the current business day." },
        { status: 403 }
      );
    }

    if (!existing && membership.role === "STAFF" && parsed.status === "LOCKED") {
      return NextResponse.json({ error: "Staff cannot create locked entries." }, { status: 403 });
    }
    if (existing && membership.role === "STAFF" && parsed.status === "LOCKED") {
      return NextResponse.json({ error: "Staff cannot lock entries directly." }, { status: 403 });
    }

    const existingLotteryLinesById = new Map<string, Record<string, unknown>>();
    if (existing) {
      const { data: existingLotteryLines, error: existingLotteryError } = await supabase
        .from("lottery_scratch_lines")
        .select("*")
        .eq("closing_day_id", existing.id);
      if (existingLotteryError) {
        throw existingLotteryError;
      }
      (existingLotteryLines ?? []).forEach((line) => {
        existingLotteryLinesById.set(String(line.id), line as Record<string, unknown>);
      });
    }

    const masterIds = Array.from(
      new Set(
        parsed.lottery_lines
          .map((line) => line.lottery_master_entry_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    const masterById = new Map<string, Record<string, unknown>>();
    if (masterIds.length > 0) {
      const { data: masterRows, error: masterError } = await supabase
        .from("lottery_master_entries")
        .select("id,display_number,name,ticket_price,default_bundle_size,is_locked")
        .eq("store_id", parsed.store_id)
        .in("id", masterIds);
      if (masterError) {
        throw masterError;
      }
      (masterRows ?? []).forEach((row) => {
        masterById.set(String(row.id), row as Record<string, unknown>);
      });
    }

    const normalizedLotteryLines: NormalizedLotteryLine[] = parsed.lottery_lines.map(
      (line, index) => {
        const existingLine = existingLotteryLinesById.get(line.id);
        const master = line.lottery_master_entry_id
          ? masterById.get(line.lottery_master_entry_id)
          : null;

        const snapshotFromExisting = {
          lottery_master_entry_id:
            existingLine?.lottery_master_entry_id === null ||
            existingLine?.lottery_master_entry_id === undefined
              ? null
              : String(existingLine.lottery_master_entry_id),
          display_number_snapshot: Number(existingLine?.display_number_snapshot ?? index + 1),
          lottery_name_snapshot: String(
            existingLine?.lottery_name_snapshot ?? existingLine?.game_name ?? "Lottery"
          ),
          ticket_price_snapshot: Number(
            existingLine?.ticket_price_snapshot ?? existingLine?.ticket_price ?? 0
          ),
          bundle_size_snapshot: Number(
            existingLine?.bundle_size_snapshot ?? existingLine?.bundle_size ?? 100
          ),
          is_locked_snapshot: Boolean(existingLine?.is_locked_snapshot)
        };

        const snapshotFromMaster = {
          lottery_master_entry_id: master ? String(master.id) : null,
          display_number_snapshot: Number(master?.display_number ?? index + 1),
          lottery_name_snapshot: String(master?.name ?? "Lottery"),
          ticket_price_snapshot: Number(master?.ticket_price ?? 0),
          bundle_size_snapshot: Number(master?.default_bundle_size ?? 100),
          is_locked_snapshot: Boolean(master?.is_locked)
        };

        const incomingSnapshot = {
          lottery_master_entry_id: line.lottery_master_entry_id ?? null,
          display_number_snapshot: Number(line.display_number_snapshot ?? index + 1),
          lottery_name_snapshot: String(
            line.lottery_name_snapshot ?? line.game_name ?? `Lottery ${index + 1}`
          ),
          ticket_price_snapshot: Number(
            line.ticket_price_snapshot ?? line.ticket_price ?? 0
          ),
          bundle_size_snapshot: Number(
            line.bundle_size_snapshot ?? line.bundle_size ?? 100
          ),
          is_locked_snapshot: Boolean(line.is_locked_snapshot)
        };

        const shouldForceExistingSnapshot =
          membership.role === "STAFF" && Boolean(snapshotFromExisting.is_locked_snapshot);
        const shouldForceMasterSnapshot =
          membership.role === "STAFF" &&
          !shouldForceExistingSnapshot &&
          Boolean(snapshotFromMaster.is_locked_snapshot);

        const chosenSnapshot = shouldForceExistingSnapshot
          ? snapshotFromExisting
          : shouldForceMasterSnapshot
            ? snapshotFromMaster
            : {
                ...incomingSnapshot,
                lottery_master_entry_id:
                  incomingSnapshot.lottery_master_entry_id ??
                  snapshotFromExisting.lottery_master_entry_id ??
                  snapshotFromMaster.lottery_master_entry_id
              };

        const normalized: NormalizedLotteryLine = {
          id: line.id,
          lottery_master_entry_id: chosenSnapshot.lottery_master_entry_id,
          display_number_snapshot: Math.max(1, Math.floor(chosenSnapshot.display_number_snapshot)),
          lottery_name_snapshot: chosenSnapshot.lottery_name_snapshot,
          ticket_price_snapshot: Math.max(0, chosenSnapshot.ticket_price_snapshot),
          bundle_size_snapshot: Math.max(
            1,
            Math.floor(chosenSnapshot.bundle_size_snapshot)
          ),
          is_locked_snapshot: Boolean(chosenSnapshot.is_locked_snapshot),
          pack_id: String(line.pack_id ?? ""),
          start_number: Math.max(
            0,
            Math.floor(Number(line.start_number ?? line.start_ticket_number ?? 0))
          ),
          end_number: Math.max(
            0,
            Math.floor(Number(line.end_number ?? line.end_ticket_number ?? 0))
          ),
          inclusive_count: Boolean(line.inclusive_count),
          tickets_sold_override:
            line.tickets_sold_override === null || line.tickets_sold_override === undefined
              ? null
              : Math.max(0, Math.floor(line.tickets_sold_override)),
          manual_override_reason: String(
            line.manual_override_reason ?? line.override_reason ?? ""
          ).trim() || null,
          payouts: Math.max(0, Number(line.payouts ?? line.scratch_payouts ?? 0))
        };

        if (normalized.end_number < normalized.start_number) {
          throw new Error(
            `Lottery line ${normalized.display_number_snapshot} has end number lower than start number.`
          );
        }

        return normalized;
      }
    );

    const totals = computeClosingTotals({
      categoryLines: parsed.category_lines.map((line) => ({
        amount: line.amount,
        taxable: line.taxable
      })),
      lotteryScratchLines: normalizedLotteryLines.map((line) => ({
        start_number: line.start_number,
        end_number: line.end_number,
        inclusive_count: line.inclusive_count,
        ticket_price_snapshot: line.ticket_price_snapshot,
        payouts: line.payouts,
        tickets_sold_override: line.tickets_sold_override ?? null,
        bundle_size_snapshot: line.bundle_size_snapshot
      })),
      draw_sales: parsed.draw_sales,
      draw_payouts: parsed.draw_payouts,
      billpayLines: parsed.billpay_lines.map((line) => ({
        amount_collected: line.amount_collected,
        fee_revenue: line.fee_revenue,
        txn_count: line.txn_count
      })),
      tax_mode: parsed.tax_mode,
      tax_rate: parsed.tax_rate_used,
      tax_amount_manual: parsed.tax_override_enabled ? parsed.tax_amount_manual ?? 0 : null,
      includeBillpayInGross: parsed.include_billpay_in_gross,
      includeLotteryInGross: parsed.include_lottery_in_gross,
      paymentBreakdown: {
        cash_amount: parsed.cash_amount,
        card_amount: parsed.card_amount,
        ebt_amount: parsed.ebt_amount,
        other_amount: parsed.other_amount
      }
    });

    const now = new Date().toISOString();
    const shouldLock =
      parsed.status === "SUBMITTED" ||
      parsed.status === "FINALIZED" ||
      parsed.status === "LOCKED";
    const statusForLineUpsert =
      membership.role === "STAFF" && shouldLock ? "DRAFT" : parsed.status;

    const closingPayload = {
      id: parsed.id,
      store_id: parsed.store_id,
      business_date: parsed.business_date,
      created_by: existing?.created_by ?? user.id,
      updated_by: user.id,
      status: statusForLineUpsert,
      tax_mode: parsed.tax_mode,
      tax_rate_used: parsed.tax_rate_used,
      tax_amount: totals.tax_amount,
      tax_override_enabled: parsed.tax_override_enabled,
      tax_amount_manual: parsed.tax_override_enabled ? parsed.tax_amount_manual ?? 0 : null,
      total_sales_gross: totals.total_sales_gross,
      taxable_sales: totals.taxable_sales,
      non_taxable_sales: totals.non_taxable_sales,
      draw_sales: parsed.draw_sales,
      draw_payouts: parsed.draw_payouts,
      lottery_total_sales: totals.lottery_total_sales,
      lottery_total_payouts: totals.lottery_total_payouts,
      lottery_net: totals.lottery_net,
      billpay_collected_total: totals.billpay_collected_total,
      billpay_fee_revenue: totals.billpay_fee_revenue,
      billpay_transactions_count: totals.billpay_transactions_count,
      cash_amount: parsed.cash_amount,
      card_amount: parsed.card_amount,
      ebt_amount: parsed.ebt_amount,
      other_amount: parsed.other_amount,
      cash_over_short: totals.cash_over_short,
      notes: parsed.notes ?? null,
      include_billpay_in_gross: parsed.include_billpay_in_gross,
      include_lottery_in_gross: parsed.include_lottery_in_gross,
      gross_collected: totals.gross_collected,
      true_revenue: totals.true_revenue,
      submitted_at: statusForLineUpsert === "SUBMITTED" ? now : existing?.submitted_at ?? null,
      finalized_at: statusForLineUpsert === "FINALIZED" ? now : existing?.finalized_at ?? null,
      locked_at: statusForLineUpsert === "LOCKED" ? now : existing?.locked_at ?? null,
      locked_by: statusForLineUpsert === "LOCKED" ? user.id : existing?.locked_by ?? null,
      version: (existing?.version ?? 0) + 1
    };

    const { data: saved, error: saveError } = await supabase
      .from("closing_days")
      .upsert(closingPayload)
      .select("*")
      .single();
    if (saveError || !saved) {
      throw saveError ?? new Error("Failed to save closing.");
    }

    const closingId = saved.id;

    const replaceLines = async <
      T extends "closing_category_lines" | "lottery_scratch_lines" | "billpay_lines",
      R extends Record<string, unknown>
    >(
      table: T,
      rows: R[]
    ) => {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq("closing_day_id", closingId);
      if (deleteError) {
        throw deleteError;
      }
      if (rows.length === 0) {
        return;
      }
      const { error: insertError } = await supabase.from(table).insert(rows);
      if (insertError) {
        throw insertError;
      }
    };

    await replaceLines(
      "closing_category_lines",
      parsed.category_lines.map((line) => ({
        id: line.id,
        closing_day_id: closingId,
        category_name: line.category_name,
        amount: line.amount,
        taxable: line.taxable
      }))
    );

    await replaceLines(
      "lottery_scratch_lines",
      normalizedLotteryLines.map((line) => {
        const computed = computeSnapshotLineTotals({
          id: line.id,
          lottery_master_entry_id: line.lottery_master_entry_id,
          display_number_snapshot: line.display_number_snapshot,
          lottery_name_snapshot: line.lottery_name_snapshot,
          ticket_price_snapshot: line.ticket_price_snapshot,
          bundle_size_snapshot: line.bundle_size_snapshot,
          is_locked_snapshot: line.is_locked_snapshot,
          pack_id: line.pack_id,
          start_number: line.start_number,
          end_number: line.end_number,
          inclusive_count: line.inclusive_count,
          tickets_sold_override: line.tickets_sold_override,
          manual_override_reason: line.manual_override_reason ?? "",
          payouts: line.payouts,
          override_reason: line.manual_override_reason
        });

        return {
          id: line.id,
          closing_day_id: closingId,
          lottery_master_entry_id: line.lottery_master_entry_id,
          display_number_snapshot: line.display_number_snapshot,
          lottery_name_snapshot: line.lottery_name_snapshot,
          ticket_price_snapshot: line.ticket_price_snapshot,
          bundle_size_snapshot: line.bundle_size_snapshot,
          is_locked_snapshot: line.is_locked_snapshot,
          start_number: line.start_number,
          end_number: line.end_number,
          tickets_sold: computed.ticketsSold,
          sales_amount: computed.salesAmount,
          payouts: computed.payouts,
          net_amount: computed.netAmount,
          manual_override_reason: line.manual_override_reason,
          game_name: line.lottery_name_snapshot,
          pack_id: line.pack_id || null,
          start_ticket_number: line.start_number,
          end_ticket_number: line.end_number,
          inclusive_count: line.inclusive_count,
          bundle_size: line.bundle_size_snapshot,
          ticket_price: line.ticket_price_snapshot,
          tickets_sold_override: line.tickets_sold_override,
          override_reason: line.manual_override_reason,
          tickets_sold_computed: computed.ticketsSold,
          scratch_sales: computed.salesAmount,
          scratch_payouts: computed.payouts
        };
      })
    );

    await replaceLines(
      "billpay_lines",
      parsed.billpay_lines.map((line) => ({
        id: line.id,
        closing_day_id: closingId,
        provider_name: line.provider_name,
        amount_collected: line.amount_collected,
        fee_revenue: line.fee_revenue,
        txn_count: line.txn_count
      }))
    );

    let finalSaved = saved;
    if (membership.role === "STAFF" && shouldLock) {
      const { data: transitioned, error: transitionError } = await supabase
        .from("closing_days")
        .update({
          status: parsed.status,
          submitted_at: parsed.status === "SUBMITTED" ? now : saved.submitted_at,
          finalized_at: parsed.status === "FINALIZED" ? now : saved.finalized_at,
          locked_at: now,
          locked_by: user.id,
          updated_by: user.id,
          version: (saved.version ?? 0) + 1
        })
        .eq("id", closingId)
        .select("*")
        .single();
      if (transitionError || !transitioned) {
        throw transitionError ?? new Error("Unable to transition closing status.");
      }
      finalSaved = transitioned;
    }

    const { error: auditError } = await supabase.from("audit_log").insert({
      store_id: parsed.store_id,
      closing_day_id: closingId,
      table_name: "closing_days",
      row_id: closingId,
      action_type: existing ? "UPDATE" : "INSERT",
      actor_id: user.id,
      reason: parsed.reopen_reason || null,
      before_data: existing ?? null,
      after_data: finalSaved
    });

    if (auditError) {
      throw auditError;
    }

    return NextResponse.json({ id: closingId, status: finalSaved.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save closing.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
