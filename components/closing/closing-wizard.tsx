"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { closingFormSchema, ClosingFormValues } from "@/lib/validation/closing";
import { computeClosingTotals } from "@/lib/math/closing";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { saveAndMaybeSync } from "@/lib/closing/save";
import { LotteryMasterEntry, Store, Role } from "@/lib/types";
import { DepthButton } from "@/components/ui/depth-button";
import { formatCurrency } from "@/lib/utils";
import { offlineDb } from "@/lib/offline/db";
import { downloadPdfBytes, generateOfflineClosingPdf } from "@/lib/pdf/client-fallback";
import { enqueueMutation } from "@/lib/offline/sync";
import { buildLotteryLinesFromMasterEntries, computeSnapshotLineTotals } from "@/lib/lottery/snapshots";
import { validateLotteryRange } from "@/lib/math/lottery";

interface ClosingWizardProps {
  store: Store;
  role: Role;
  initialValue?: ClosingFormValues;
  lotteryMasterEntries?: LotteryMasterEntry[];
  allowPrintPdf: boolean;
}

const steps = [
  "Summary",
  "Products",
  "Lottery",
  "Billpay",
  "Payments & Tax",
  "Notes",
  "Review"
] as const;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const ClosingWizard = ({
  store,
  role,
  initialValue,
  lotteryMasterEntries = [],
  allowPrintPdf
}: ClosingWizardProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [lastSavedStatus, setLastSavedStatus] = useState<ClosingFormValues["status"]>(
    initialValue?.status ?? "DRAFT"
  );
  const form = useForm<ClosingFormValues>({
    resolver: zodResolver(closingFormSchema),
    defaultValues: initialValue ?? createEmptyClosing(store, lotteryMasterEntries),
    mode: "onBlur"
  });

  const categoryArray = useFieldArray({ control: form.control, name: "category_lines" });
  const lotteryArray = useFieldArray({ control: form.control, name: "lottery_lines" });
  const billpayArray = useFieldArray({ control: form.control, name: "billpay_lines" });

  const watched = useWatch({ control: form.control });
  const deferredWatched = useDeferredValue(watched);
  const lotteryLineCount = watched.lottery_lines?.length ?? 0;
  const lockForStaff = role === "STAFF" && lastSavedStatus !== "DRAFT";
  const readOnly = role === "STAFF" && (lockForStaff || watched.status === "LOCKED");

  const totals = useMemo(() => {
    return computeClosingTotals({
      categoryLines: (deferredWatched.category_lines ?? []).map((line) => ({
        amount: Number(line.amount ?? 0),
        taxable: Boolean(line.taxable)
      })),
      lotteryScratchLines: (deferredWatched.lottery_lines ?? []).map((line) => ({
        start_number: Number(line.start_number ?? 0),
        end_number: Number(line.end_number ?? 0),
        inclusive_count: Boolean(line.inclusive_count),
        ticket_price_snapshot: Number(line.ticket_price_snapshot ?? line.ticket_price ?? 0),
        payouts: Number(line.payouts ?? line.scratch_payouts ?? 0),
        tickets_sold_override: line.tickets_sold_override ?? null,
        bundle_size_snapshot: Number(
          line.bundle_size_snapshot ?? line.bundle_size ?? store.scratch_bundle_size_default
        )
      })),
      draw_sales: Number(deferredWatched.draw_sales ?? 0),
      draw_payouts: Number(deferredWatched.draw_payouts ?? 0),
      billpayLines: (deferredWatched.billpay_lines ?? []).map((line) => ({
        amount_collected: Number(line.amount_collected ?? 0),
        fee_revenue: Number(line.fee_revenue ?? 0),
        txn_count: Number(line.txn_count ?? 0)
      })),
      tax_mode: deferredWatched.tax_mode ?? "AUTO",
      tax_rate: Number(deferredWatched.tax_rate_used ?? 0),
      tax_amount_manual: deferredWatched.tax_override_enabled
        ? Number(deferredWatched.tax_amount_manual ?? 0)
        : null,
      includeBillpayInGross: Boolean(deferredWatched.include_billpay_in_gross),
      includeLotteryInGross: Boolean(deferredWatched.include_lottery_in_gross),
      paymentBreakdown: {
        cash_amount: Number(deferredWatched.cash_amount ?? 0),
        card_amount: Number(deferredWatched.card_amount ?? 0),
        ebt_amount: Number(deferredWatched.ebt_amount ?? 0),
        other_amount: Number(deferredWatched.other_amount ?? 0)
      }
    });
  }, [deferredWatched, store.scratch_bundle_size_default]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = form.watch(async (values) => {
      if (readOnly) {
        return;
      }
      if (!values.id || !values.store_id || !values.business_date) {
        return;
      }
      try {
        const parsed = closingFormSchema.parse(values);
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(async () => {
          await offlineDb.closings.put({
            ...parsed,
            updated_at: new Date().toISOString(),
            _dirty: false
          });
        }, 900);
      } catch {
        // Autosave intentionally ignores validation until explicit save.
      }
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      subscription.unsubscribe();
    };
  }, [form, readOnly]);

  useEffect(() => {
    if (initialValue || lotteryLineCount > 0) {
      return;
    }
    let active = true;
    void (async () => {
      const cachedEntries = await offlineDb.lotteryMasterEntries
        .where("store_id")
        .equals(store.id)
        .filter((entry) => entry.is_active)
        .toArray();
      if (!active || cachedEntries.length === 0) {
        return;
      }
      const snapshotLines = buildLotteryLinesFromMasterEntries(cachedEntries);
      if (snapshotLines.length === 0) {
        return;
      }
      form.setValue("lottery_lines", snapshotLines, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false
      });
    })();
    return () => {
      active = false;
    };
  }, [form, initialValue, lotteryLineCount, store.id]);

  const persist = (status: ClosingFormValues["status"]) =>
    form.handleSubmit((values) => {
      if (role === "STAFF" && readOnly) {
        toast.error("This closing has been locked. Contact admin for changes.");
        return;
      }

      startTransition(async () => {
        try {
          const payload: ClosingFormValues = {
            ...values,
            status,
            tax_amount_manual: values.tax_override_enabled ? values.tax_amount_manual : null
          };
          await saveAndMaybeSync({ values: payload, role });

          setLastSavedStatus(status);
          form.setValue("status", status);
          toast.success(
            status === "DRAFT"
              ? "Draft saved."
              : status === "SUBMITTED"
                ? "Closing submitted. This closing has been locked. Contact admin for changes."
                : status === "FINALIZED"
                  ? "Closing finalized. This closing has been locked. Contact admin for changes."
                  : "Closing locked."
          );
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Save failed.");
        }
      });
    })();

  const appendLotteryLine = () => {
    const existingLines = form.getValues("lottery_lines") ?? [];
    const nextDisplayNumber =
      existingLines.reduce(
        (maxValue, line) => Math.max(maxValue, Number(line.display_number_snapshot ?? 0)),
        0
      ) + 1;

    lotteryArray.append({
      id: crypto.randomUUID(),
      lottery_master_entry_id: null,
      display_number_snapshot: Math.max(1, nextDisplayNumber),
      lottery_name_snapshot: `Lottery ${Math.max(1, nextDisplayNumber)}`,
      ticket_price_snapshot: 0,
      bundle_size_snapshot: store.scratch_bundle_size_default,
      is_locked_snapshot: false,
      pack_id: "",
      start_number: 0,
      end_number: 0,
      inclusive_count: false,
      tickets_sold_override: null,
      manual_override_reason: "",
      override_reason: "",
      payouts: 0
    });
  };

  const generatePdf = async () => {
    if (!allowPrintPdf && role === "STAFF") {
      toast.error("PDF printing is disabled for staff.");
      return;
    }
    const values = form.getValues();
    try {
      const response = await fetch(`/api/closings/${values.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartData: {
            gross: [
              { name: "Products", value: totals.product_sales_total },
              { name: "Lottery", value: totals.lottery_total_sales },
              { name: "Billpay", value: totals.billpay_collected_total }
            ],
            payments: [
              { name: "Cash", value: values.cash_amount },
              { name: "Card", value: values.card_amount },
              { name: "EBT", value: values.ebt_amount },
              { name: "Other", value: values.other_amount }
            ]
          }
        })
      });
      if (!response.ok) {
        throw new Error("Server PDF generation unavailable.");
      }
      const payload = (await response.json()) as { url?: string };
      if (payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
      }
      return;
    } catch {
      const bytes = await generateOfflineClosingPdf({
        store,
        closing: values,
        totals: {
          gross_collected: totals.gross_collected,
          true_revenue: totals.true_revenue,
          tax_amount: totals.tax_amount
        }
      });
      const fileName = `offline_closing_${values.business_date}_${Date.now()}.pdf`;
      const bytesBase64 = bytesToBase64(bytes);
      downloadPdfBytes(bytes, fileName);
      await offlineDb.documents.put({
        id: crypto.randomUUID(),
        closing_day_id: values.id,
        store_id: values.store_id,
        file_name: fileName,
        bytes_base64: bytesBase64,
        created_at: new Date().toISOString(),
        _dirty: true
      });
      await enqueueMutation({
        type: "UPLOAD_DOCUMENT",
        store_id: values.store_id,
        entity_id: values.id,
        payload: {
          store_id: values.store_id,
          closing_day_id: values.id,
          file_name: fileName,
          bytes_base64: bytesBase64
        }
      });
      toast.info("Offline PDF generated. Upload queued for next sync.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface overflow-x-auto p-3">
        <ol className="flex min-w-max items-center gap-2">
          {steps.map((step, index) => (
            <li
              key={step}
              className={`rounded-full px-3 py-1 text-xs ${
                index === stepIndex ? "bg-white/20 text-white" : "bg-white/5 text-white/70"
              }`}
            >
              {step}
            </li>
          ))}
        </ol>
      </div>

      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="surface space-y-4 p-4"
      >
        {stepIndex === 0 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Summary</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">Business date</label>
                <input
                  className="field"
                  type="date"
                  disabled={readOnly}
                  {...form.register("business_date")}
                />
              </div>
              <div>
                <label className="field-label">Status</label>
                <input className="field" value={watched.status} disabled />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  {...form.register("include_billpay_in_gross")}
                />
                Include billpay collected in gross
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  {...form.register("include_lottery_in_gross")}
                />
                Include lottery sales in gross
              </label>
            </div>
          </section>
        )}

        {stepIndex === 1 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Product Categories</h3>
            {categoryArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 sm:grid-cols-4">
                <input
                  className="field sm:col-span-2"
                  disabled={readOnly}
                  placeholder="Category"
                  {...form.register(`category_lines.${index}.category_name`)}
                />
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  {...form.register(`category_lines.${index}.amount`, { valueAsNumber: true })}
                />
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    {...form.register(`category_lines.${index}.taxable`)}
                  />
                  Taxable
                </label>
                {!readOnly && categoryArray.fields.length > 1 && (
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                    onClick={() => categoryArray.remove(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
                onClick={() =>
                  categoryArray.append({
                    id: crypto.randomUUID(),
                    category_name: "",
                    amount: 0,
                    taxable: true
                  })
                }
              >
                Add category
              </button>
            )}
          </section>
        )}

        {stepIndex === 2 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Lottery Scratch + Draw</h3>
              {!readOnly && (
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
                  onClick={appendLotteryLine}
                >
                  Add New Lottery
                </button>
              )}
            </div>
            {lotteryArray.fields.map((field, index) => {
              const line = watched.lottery_lines?.[index];
              const lineLocked = Boolean(line?.is_locked_snapshot);
              const lineSnapshot = {
                id: field.id,
                display_number_snapshot: Number(line?.display_number_snapshot ?? index + 1),
                lottery_name_snapshot: String(line?.lottery_name_snapshot ?? "Lottery"),
                ticket_price_snapshot: Number(line?.ticket_price_snapshot ?? 0),
                bundle_size_snapshot: Number(
                  line?.bundle_size_snapshot ?? store.scratch_bundle_size_default
                ),
                is_locked_snapshot: Boolean(line?.is_locked_snapshot),
                start_number: Number(line?.start_number ?? 0),
                end_number: Number(line?.end_number ?? 0),
                inclusive_count: Boolean(line?.inclusive_count),
                tickets_sold_override: line?.tickets_sold_override ?? null,
                payouts: Number(line?.payouts ?? 0),
                manual_override_reason: String(line?.manual_override_reason ?? "")
              };
              const computed = computeSnapshotLineTotals(lineSnapshot);
              const rangeState = validateLotteryRange({
                startNumber: lineSnapshot.start_number,
                endNumber: lineSnapshot.end_number,
                inclusiveCount: lineSnapshot.inclusive_count,
                bundleSize: lineSnapshot.bundle_size_snapshot
              });
              return (
                <div key={field.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-crimson/50 bg-brand-crimson/20 text-sm font-semibold">
                        {lineSnapshot.display_number_snapshot}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {lineSnapshot.lottery_name_snapshot || `Lottery ${index + 1}`}
                        </p>
                        <p className="text-xs text-white/70">
                          Amount {formatCurrency(lineSnapshot.ticket_price_snapshot)} · Bundle{" "}
                          {lineSnapshot.bundle_size_snapshot || store.scratch_bundle_size_default}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {lineSnapshot.is_locked_snapshot && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                          Locked
                        </span>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                          onClick={() =>
                            form.setValue(
                              `lottery_lines.${index}.is_locked_snapshot`,
                              !lineLocked,
                              {
                                shouldDirty: true,
                                shouldTouch: true
                              }
                            )
                          }
                        >
                          {lineLocked ? "Unlock" : "Lock"}
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          className="rounded border border-red-300/40 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
                          onClick={() => lotteryArray.remove(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="hidden"
                    {...form.register(`lottery_lines.${index}.lottery_master_entry_id`)}
                  />
                  <input
                    type="hidden"
                    {...form.register(`lottery_lines.${index}.display_number_snapshot`, {
                      valueAsNumber: true
                    })}
                  />
                  <input
                    type="hidden"
                    {...form.register(`lottery_lines.${index}.bundle_size_snapshot`, {
                      valueAsNumber: true
                    })}
                  />
                  <input
                    type="hidden"
                    {...form.register(`lottery_lines.${index}.is_locked_snapshot`)}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Lottery Name</label>
                      <input
                        className="field"
                        disabled={readOnly || lineLocked}
                        placeholder="Lottery name"
                        {...form.register(`lottery_lines.${index}.lottery_name_snapshot`)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Amount</label>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        min={0}
                        disabled={readOnly || lineLocked}
                        {...form.register(`lottery_lines.${index}.ticket_price_snapshot`, {
                          valueAsNumber: true
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className="field-label">Start Number</label>
                      <input
                        className="field"
                        type="number"
                        disabled={readOnly}
                        {...form.register(`lottery_lines.${index}.start_number`, {
                          valueAsNumber: true
                        })}
                      />
                    </div>
                    <div>
                      <label className="field-label">End Number</label>
                      <input
                        className="field"
                        type="number"
                        disabled={readOnly}
                        {...form.register(`lottery_lines.${index}.end_number`, {
                          valueAsNumber: true
                        })}
                      />
                    </div>
                    <div>
                      <label className="field-label">Payouts / Paidouts</label>
                      <input
                        className="field"
                        type="number"
                        step="0.01"
                        disabled={readOnly}
                        {...form.register(`lottery_lines.${index}.payouts`, {
                          valueAsNumber: true
                        })}
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <p className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/80">
                      Tickets Sold: <strong>{computed.ticketsSold}</strong>
                    </p>
                    <p className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/80">
                      Sales: <strong>{formatCurrency(computed.salesAmount)}</strong>
                    </p>
                    <p className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/80">
                      Payouts: <strong>{formatCurrency(computed.payouts)}</strong>
                    </p>
                    <p className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/80">
                      Net: <strong>{formatCurrency(computed.netAmount)}</strong>
                    </p>
                  </div>
                  {!rangeState.isValid && (
                    <p className="mt-2 text-xs text-red-300">{rangeState.error}</p>
                  )}
                  {rangeState.warning && (
                    <p className="mt-1 text-xs text-amber-200">{rangeState.warning}</p>
                  )}
                </div>
              );
            })}
            {lotteryArray.fields.length === 0 && (
              <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 p-3 text-xs text-amber-100">
                No lottery lines yet. Click Add Lottery to create one with name and amount.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="field-label">Draw sales</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("draw_sales", { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="field-label">Draw payouts</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("draw_payouts", { valueAsNumber: true })}
                />
              </div>
            </div>
          </section>
        )}

        {stepIndex === 3 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Billpay</h3>
            {billpayArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 sm:grid-cols-4">
                <input
                  className="field"
                  placeholder="Provider"
                  disabled={readOnly}
                  {...form.register(`billpay_lines.${index}.provider_name`)}
                />
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  placeholder="Collected"
                  disabled={readOnly}
                  {...form.register(`billpay_lines.${index}.amount_collected`, {
                    valueAsNumber: true
                  })}
                />
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  placeholder="Fee revenue"
                  disabled={readOnly}
                  {...form.register(`billpay_lines.${index}.fee_revenue`, {
                    valueAsNumber: true
                  })}
                />
                <input
                  className="field"
                  type="number"
                  placeholder="Transactions"
                  disabled={readOnly}
                  {...form.register(`billpay_lines.${index}.txn_count`, {
                    valueAsNumber: true
                  })}
                />
                {!readOnly && billpayArray.fields.length > 1 && (
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                    onClick={() => billpayArray.remove(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
                onClick={() =>
                  billpayArray.append({
                    id: crypto.randomUUID(),
                    provider_name: "",
                    amount_collected: 0,
                    fee_revenue: 0,
                    txn_count: 0
                  })
                }
              >
                Add billpay line
              </button>
            )}
          </section>
        )}

        {stepIndex === 4 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Payments & Tax</h3>
            <div className="grid gap-2 sm:grid-cols-4">
              <div>
                <label className="field-label">Cash</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("cash_amount", { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="field-label">Card</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("card_amount", { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="field-label">EBT</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("ebt_amount", { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="field-label">Other</label>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  disabled={readOnly}
                  {...form.register("other_amount", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className="field-label">Tax mode</label>
                <select className="field" disabled={readOnly} {...form.register("tax_mode")}>
                  <option value="AUTO">AUTO</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </div>
              <div>
                <label className="field-label">Tax rate</label>
                <input
                  className="field"
                  type="number"
                  step="0.0001"
                  disabled={readOnly}
                  {...form.register("tax_rate_used", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <label className="field-label">Tax override amount</label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  disabled={readOnly || !watched.tax_override_enabled}
                  {...form.register("tax_amount_manual", {
                    setValueAs: (value) =>
                      value === "" || value === null || value === undefined
                        ? null
                        : Number(value)
                  })}
                />
                <label className="inline-flex items-center gap-2 text-xs text-white/75">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    {...form.register("tax_override_enabled")}
                  />
                  Override tax amount
                </label>
              </div>
            </div>
          </section>
        )}

        {stepIndex === 5 && (
          <section className="space-y-2">
            <h3 className="text-lg font-semibold">Notes</h3>
            <textarea
              rows={5}
              className="field"
              disabled={readOnly}
              placeholder="Shift notes, overrides, or incidents..."
              {...form.register("notes")}
            />
          </section>
        )}

        {stepIndex === 6 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Review Totals</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Gross collected: <strong>{formatCurrency(totals.gross_collected)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                True revenue: <strong>{formatCurrency(totals.true_revenue)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Taxable sales: <strong>{formatCurrency(totals.taxable_sales)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Tax amount: <strong>{formatCurrency(totals.tax_amount)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Lottery net: <strong>{formatCurrency(totals.lottery_net)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Over/short: <strong>{formatCurrency(totals.cash_over_short)}</strong>
              </p>
            </div>
            {lockForStaff && (
              <p className="rounded-lg border border-amber-400/40 bg-amber-500/15 p-3 text-sm text-amber-100">
                This closing has been locked. Contact admin for changes.
              </p>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={stepIndex === steps.length - 1}
              onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))}
            >
              Next
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={pending || readOnly}
              onClick={() => persist("DRAFT")}
            >
              Save Draft
            </button>
            <DepthButton
              type="button"
              disabled={pending || readOnly}
              onClick={async () => {
                const ok = window.confirm(
                  "After submission, staff cannot edit this entry. Continue?"
                );
                if (!ok) {
                  return;
                }
                await persist("SUBMITTED");
              }}
            >
              Submit Closing
            </DepthButton>
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={pending || readOnly}
              onClick={async () => {
                const ok = window.confirm(
                  "Finalize this closing? Staff will not be able to edit afterward."
                );
                if (!ok) {
                  return;
                }
                await persist("FINALIZED");
              }}
            >
              Finalize Closing
            </button>
            {role === "ADMIN" && (
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                disabled={pending}
                onClick={async () => {
                  const ok = window.confirm("Lock this closing now?");
                  if (!ok) {
                    return;
                  }
                  await persist("LOCKED");
                }}
              >
                Lock Entry
              </button>
            )}
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={pending || (role === "STAFF" && !allowPrintPdf)}
              onClick={generatePdf}
            >
              Generate PDF
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
