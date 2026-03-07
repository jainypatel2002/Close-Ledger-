import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembershipForStore } from "@/lib/server/rbac";
import { storeProfileSchema } from "@/lib/validation/closing";
import { lotteryMasterEntrySchema } from "@/lib/validation/lottery-master";

export async function POST(request: NextRequest) {
  try {
    const { mutation } = (await request.json()) as {
      mutation?: {
        type: string;
        store_id: string | null;
        entity_id: string | null;
        payload: Record<string, unknown>;
      };
    };

    if (!mutation) {
      return NextResponse.json({ error: "Missing mutation payload." }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (mutation.type === "UPSERT_CLOSING") {
      const paymentLines = Array.isArray(mutation.payload.payment_lines)
        ? mutation.payload.payment_lines
        : [
            {
              id: crypto.randomUUID(),
              payment_type: "cash",
              label: "Cash",
              amount: Number(mutation.payload.cash_amount ?? 0),
              sort_order: 0
            },
            {
              id: crypto.randomUUID(),
              payment_type: "card",
              label: "Card",
              amount: Number(mutation.payload.card_amount ?? 0),
              sort_order: 1
            },
            {
              id: crypto.randomUUID(),
              payment_type: "ebt",
              label: "EBT",
              amount: Number(mutation.payload.ebt_amount ?? 0),
              sort_order: 2
            },
            {
              id: crypto.randomUUID(),
              payment_type: "other",
              label: "Other",
              amount: Number(mutation.payload.other_amount ?? 0),
              sort_order: 3
            }
          ];
      const payload = {
        ...mutation.payload,
        lottery_total_scratch_revenue: Number(
          mutation.payload.lottery_total_scratch_revenue ?? 0
        ),
        lottery_online_amount: Number(mutation.payload.lottery_online_amount ?? 0),
        lottery_paid_out_amount: Number(mutation.payload.lottery_paid_out_amount ?? 0),
        lottery_amount_due: Number(mutation.payload.lottery_amount_due ?? 0),
        payment_lines: paymentLines
      };
      const response = await fetch(new URL("/api/closings/upsert", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") ?? ""
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return NextResponse.json(
          {
            error:
              data.error || "This record is locked or you do not have permission to edit it."
          },
          { status: response.status }
        );
      }
      return NextResponse.json({ ok: true, data });
    }

    if (mutation.type === "UPSERT_STORE") {
      if (!mutation.store_id) {
        return NextResponse.json({ error: "Missing store id." }, { status: 400 });
      }
      const payload = storeProfileSchema.parse(mutation.payload);
      const supabase = await createSupabaseServerClient();
      const membership = await getMembershipForStore(mutation.store_id);
      if (membership && membership.role !== "ADMIN") {
        return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
      }
      const { error } = await supabase.from("stores").upsert({
        ...payload,
        id: mutation.store_id,
        owner_id: user.id
      });
      if (error) {
        throw error;
      }
      if (!membership) {
        await supabase.from("store_members").upsert(
          {
            store_id: mutation.store_id,
            user_id: user.id,
            role: "ADMIN",
            is_active: true
          },
          { onConflict: "store_id,user_id" }
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (mutation.type === "UPLOAD_DOCUMENT") {
      const storeId = String(mutation.payload.store_id ?? mutation.store_id ?? "");
      const closingId = String(mutation.payload.closing_day_id ?? mutation.entity_id ?? "");
      const fileName = String(mutation.payload.file_name ?? "offline_closing.pdf");
      const bytesBase64 = String(mutation.payload.bytes_base64 ?? "");
      if (!storeId || !closingId || !bytesBase64) {
        return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
      }
      const membership = await getMembershipForStore(storeId);
      if (!membership) {
        return NextResponse.json({ error: "No access to store." }, { status: 403 });
      }
      const binary = Uint8Array.from(Buffer.from(bytesBase64, "base64"));
      const path = `${user.id}/${storeId}/${new Date().toISOString().slice(0, 10).replaceAll("-", "/")}/${fileName}`;
      const supabase = await createSupabaseServerClient();
      const { error: uploadError } = await supabase.storage
        .from("closing-pdfs")
        .upload(path, binary, { contentType: "application/pdf", upsert: true });
      if (uploadError) {
        throw uploadError;
      }
      const { data: signed } = await supabase.storage
        .from("closing-pdfs")
        .createSignedUrl(path, 60 * 60 * 24 * 7);

      const { error: docError } = await supabase.from("closing_documents").insert({
        closing_day_id: closingId,
        store_id: storeId,
        created_by: user.id,
        file_name: fileName,
        bucket_path: path,
        public_url: signed?.signedUrl ?? null,
        document_type: "closing_pdf",
        report_year: null,
        report_month: null,
        source: "CLIENT_OFFLINE"
      });
      if (docError) {
        throw docError;
      }
      return NextResponse.json({ ok: true });
    }

    if (mutation.type === "UPSERT_LOTTERY_MASTER") {
      const storeId = String(mutation.payload.store_id ?? mutation.store_id ?? "");
      if (!storeId) {
        return NextResponse.json({ error: "Missing store id." }, { status: 400 });
      }
      const membership = await getMembershipForStore(storeId);
      if (!membership || membership.role !== "ADMIN") {
        return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
      }
      const payload = lotteryMasterEntrySchema.parse({
        ...mutation.payload,
        store_id: storeId
      });
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("lottery_master_entries").upsert({
        id: payload.id,
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
      });
      if (error) {
        throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (mutation.type === "DELETE_LOTTERY_MASTER") {
      const storeId = String(mutation.payload.store_id ?? mutation.store_id ?? "");
      const entryId = String(mutation.payload.id ?? mutation.entity_id ?? "");
      if (!storeId || !entryId) {
        return NextResponse.json({ error: "Missing lottery id." }, { status: 400 });
      }
      const membership = await getMembershipForStore(storeId);
      if (!membership || membership.role !== "ADMIN") {
        return NextResponse.json({ error: "Admin permission required." }, { status: 403 });
      }
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("lottery_master_entries")
        .delete()
        .eq("id", entryId)
        .eq("store_id", storeId);
      if (error) {
        throw error;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported mutation type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync mutation failed." },
      { status: 400 }
    );
  }
}
