"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DEFAULT_SCRATCH_BUNDLE_SIZE, DEFAULT_TAX_RATE, DEFAULT_TIMEZONE } from "@/lib/constants";
import { Store } from "@/lib/types";
import { storeProfileSchema, StoreProfileValues } from "@/lib/validation/closing";
import { DepthButton } from "@/components/ui/depth-button";
import { enqueueMutation } from "@/lib/offline/sync";
import { offlineDb } from "@/lib/offline/db";

interface StoreProfileFormProps {
  initialStore?: Store;
  submitAction: (values: StoreProfileValues) => Promise<void>;
  submitLabel: string;
}

export const StoreProfileForm = ({
  initialStore,
  submitAction,
  submitLabel
}: StoreProfileFormProps) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<StoreProfileValues>({
    resolver: zodResolver(storeProfileSchema),
    defaultValues: {
      store_name: initialStore?.store_name ?? "",
      legal_name: initialStore?.legal_name ?? "",
      address_line1: initialStore?.address_line1 ?? "",
      address_line2: initialStore?.address_line2 ?? "",
      city: initialStore?.city ?? "",
      state: initialStore?.state ?? "",
      zip: initialStore?.zip ?? "",
      phone: initialStore?.phone ?? "",
      email: initialStore?.email ?? "",
      header_text: initialStore?.header_text ?? "",
      tax_rate_default: initialStore?.tax_rate_default ?? DEFAULT_TAX_RATE,
      timezone: initialStore?.timezone ?? DEFAULT_TIMEZONE,
      scratch_bundle_size_default:
        initialStore?.scratch_bundle_size_default ?? DEFAULT_SCRATCH_BUNDLE_SIZE,
      include_billpay_in_gross: initialStore?.include_billpay_in_gross ?? true,
      include_lottery_in_gross: initialStore?.include_lottery_in_gross ?? true,
      allow_staff_view_history: initialStore?.allow_staff_view_history ?? false,
      allow_staff_print_pdf: initialStore?.allow_staff_print_pdf ?? false,
      allow_staff_export: initialStore?.allow_staff_export ?? false
    }
  });

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      try {
        await submitAction(values);
        toast.success("Store settings saved.");
        router.refresh();
      } catch (error) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const storeId = initialStore?.id ?? crypto.randomUUID();
          const now = new Date().toISOString();
          const offlineValues = {
            ...values,
            legal_name: values.legal_name || null,
            address_line2: values.address_line2 || null,
            phone: values.phone || null,
            email: values.email || null,
            header_text: values.header_text || null
          };
          await offlineDb.stores.put({
            id: storeId,
            owner_id: initialStore?.owner_id ?? null,
            ...offlineValues,
            created_at: initialStore?.created_at ?? now,
            updated_at: now,
            _dirty: true
          });
          await enqueueMutation({
            type: "UPSERT_STORE",
            store_id: storeId,
            entity_id: storeId,
            payload: {
              ...offlineValues,
              id: storeId
            }
          });
          toast.info("Saved offline. Store profile will sync when back online.");
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to save store.";
        toast.error(message);
      }
    });
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">Store name</label>
          <input className="field" {...form.register("store_name")} />
          <p className="mt-1 text-xs text-red-300">
            {form.formState.errors.store_name?.message}
          </p>
        </div>
        <div>
          <label className="field-label">Legal name</label>
          <input className="field" {...form.register("legal_name")} />
        </div>
      </div>

      <div>
        <label className="field-label">Address line 1</label>
        <input className="field" {...form.register("address_line1")} />
      </div>
      <div>
        <label className="field-label">Address line 2</label>
        <input className="field" {...form.register("address_line2")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label">City</label>
          <input className="field" {...form.register("city")} />
        </div>
        <div>
          <label className="field-label">State</label>
          <input className="field" {...form.register("state")} />
        </div>
        <div>
          <label className="field-label">ZIP</label>
          <input className="field" {...form.register("zip")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">Phone</label>
          <input className="field" {...form.register("phone")} />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input className="field" {...form.register("email")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">Default tax rate</label>
          <input
            className="field"
            type="number"
            step="0.0001"
            {...form.register("tax_rate_default", { valueAsNumber: true })}
          />
        </div>
        <div>
          <label className="field-label">Scratch bundle size</label>
          <input
            className="field"
            type="number"
            {...form.register("scratch_bundle_size_default", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" {...form.register("include_billpay_in_gross")} />
          Include billpay collected in gross totals
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" {...form.register("include_lottery_in_gross")} />
          Include lottery sales in gross totals
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" {...form.register("allow_staff_view_history")} />
          Staff can view history
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" {...form.register("allow_staff_print_pdf")} />
          Staff can print PDFs
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" {...form.register("allow_staff_export")} />
          Staff can export reports
        </label>
      </div>

      <DepthButton type="submit" disabled={pending}>
        {pending ? "Saving..." : submitLabel}
      </DepthButton>
    </form>
  );
};
