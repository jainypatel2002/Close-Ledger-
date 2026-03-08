"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  closingFormSchema,
  ClosingFormValues,
  formatClosingValidationDiagnostics,
  formatClosingValidationError,
  normalizeClosingFormValues
} from "@/lib/validation/closing";
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
import {
  getNextLotteryDisplayNumber,
  sortLotteryMasterEntries,
  upsertLotteryMasterEntry,
  upsertLotteryMasterEntryInDraftLines
} from "@/lib/lottery/closing-draft";
import {
  createLotteryMasterFormState,
  LotteryMasterFormState,
  parseLotteryMasterFormState
} from "@/lib/lottery/master-form";
import { findUsableLotteryConflicts, isLotteryUsable } from "@/lib/lottery/master-rules";

interface ClosingWizardProps {
  store: Store;
  role: Role;
  initialValue?: ClosingFormValues;
  lotteryMasterEntries?: LotteryMasterEntry[];
  allowPrintPdf: boolean;
  autoPrepareNextEntry?: boolean;
}

const steps = [
  "Summary",
  "Lottery",
  "Billpay",
  "Payments & Tax",
  "Notes",
  "Review"
] as const;

type ActionIntent = "draft" | "submit" | "finalize" | "lock" | "pdf";

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const createLotteryConfigFormState = (
  entries: LotteryMasterEntry[],
  scratchBundleSizeDefault: number
): LotteryMasterFormState =>
  createLotteryMasterFormState({
    nextDisplayNumber: getNextLotteryDisplayNumber(entries),
    defaultBundleSize: scratchBundleSizeDefault,
    defaultLocked: true
  });

export const ClosingWizard = ({
  store,
  role,
  initialValue,
  lotteryMasterEntries = [],
  allowPrintPdf,
  autoPrepareNextEntry = false
}: ClosingWizardProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<ActionIntent | null>(null);
  const [lastSavedStatus, setLastSavedStatus] = useState<ClosingFormValues["status"]>(
    initialValue?.status ?? "DRAFT"
  );
  const [lotteryCatalog, setLotteryCatalog] = useState<LotteryMasterEntry[]>(
    sortLotteryMasterEntries(lotteryMasterEntries)
  );
  const [isLotteryConfigFormOpen, setIsLotteryConfigFormOpen] = useState(false);
  const [lotteryConfigForm, setLotteryConfigForm] = useState<LotteryMasterFormState>(() =>
    createLotteryConfigFormState(lotteryMasterEntries, store.scratch_bundle_size_default)
  );
  const form = useForm<ClosingFormValues>({
    resolver: zodResolver(closingFormSchema),
    defaultValues: initialValue ?? createEmptyClosing(store, lotteryMasterEntries),
    mode: "onBlur"
  });

  const lotteryArray = useFieldArray({
    control: form.control,
    name: "lottery_lines",
    keyName: "fieldKey"
  });
  const billpayArray = useFieldArray({
    control: form.control,
    name: "billpay_lines",
    keyName: "fieldKey"
  });
  const paymentArray = useFieldArray({
    control: form.control,
    name: "payment_lines",
    keyName: "fieldKey"
  });

  const watched = useWatch({ control: form.control });
  const deferredWatched = useDeferredValue(watched);
  const lotteryLineCount = watched.lottery_lines?.length ?? 0;
  const lockForStaff = role === "STAFF" && lastSavedStatus !== "DRAFT";
  const readOnly = role === "STAFF" && (lockForStaff || watched.status === "LOCKED");
  const canManageLotteryConfig = role === "ADMIN";
  const lotteryRowIndexes = useMemo(
    () =>
      lotteryArray.fields
        .map((_, index) => index)
        .sort(
          (a, b) =>
            Number(watched.lottery_lines?.[a]?.display_number_snapshot ?? a + 1) -
            Number(watched.lottery_lines?.[b]?.display_number_snapshot ?? b + 1)
        ),
    [lotteryArray.fields, watched.lottery_lines]
  );
  const sortedLotteryCatalog = useMemo(
    () => sortLotteryMasterEntries(lotteryCatalog),
    [lotteryCatalog]
  );
  const taxableSalesInput = useMemo(
    () =>
      (watched.category_lines ?? [])
        .filter((line) => line.taxable)
        .reduce((sum, line) => sum + Number(line.amount ?? 0), 0),
    [watched.category_lines]
  );
  const nonTaxableSalesInput = useMemo(
    () =>
      (watched.category_lines ?? [])
        .filter((line) => !line.taxable)
        .reduce((sum, line) => sum + Number(line.amount ?? 0), 0),
    [watched.category_lines]
  );

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
        tickets_sold_override: line.tickets_sold_override ?? null,
        bundle_size_snapshot: Number(
          line.bundle_size_snapshot ?? line.bundle_size ?? store.scratch_bundle_size_default
        )
      })),
      lottery_online_amount: Number(deferredWatched.lottery_online_amount ?? 0),
      lottery_paid_out_amount: Number(deferredWatched.lottery_paid_out_amount ?? 0),
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
      paymentLines: (deferredWatched.payment_lines ?? []).map((line) => ({
        payment_type: line.payment_type ?? "other",
        amount: Number(line.amount ?? 0)
      })),
      paymentBreakdown: {
        cash_amount: Number(deferredWatched.cash_amount ?? 0),
        card_amount: Number(deferredWatched.card_amount ?? 0),
        ebt_amount: Number(deferredWatched.ebt_amount ?? 0),
        other_amount: Number(deferredWatched.other_amount ?? 0)
      }
    });
  }, [deferredWatched, store.scratch_bundle_size_default]);

  useEffect(() => {
    form.setValue("lottery_total_scratch_revenue", totals.lottery_total_scratch_revenue, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
    form.setValue("lottery_amount_due", totals.lottery_amount_due, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
    form.setValue("cash_amount", totals.cash_amount, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
    form.setValue("card_amount", totals.card_amount, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
    form.setValue("ebt_amount", totals.ebt_amount, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
    form.setValue("other_amount", totals.other_amount, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
  }, [
    form,
    totals.card_amount,
    totals.cash_amount,
    totals.ebt_amount,
    totals.lottery_amount_due,
    totals.lottery_total_scratch_revenue,
    totals.other_amount
  ]);

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
        const parsed = closingFormSchema.parse(normalizeClosingFormValues(values));
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
    const sorted = sortLotteryMasterEntries(lotteryMasterEntries);
    setLotteryCatalog(sorted);
    setLotteryConfigForm(
      createLotteryConfigFormState(sorted, store.scratch_bundle_size_default)
    );
    setIsLotteryConfigFormOpen(false);
  }, [lotteryMasterEntries, store.id, store.scratch_bundle_size_default]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cachedEntries = await offlineDb.lotteryMasterEntries
        .where("store_id")
        .equals(store.id)
        .toArray();
      const pendingLocalEntries = cachedEntries.filter((entry) => entry._dirty);
      if (!active || pendingLocalEntries.length === 0) {
        return;
      }
      setLotteryCatalog((current) => {
        let merged = current;
        pendingLocalEntries.forEach((entry) => {
          merged = upsertLotteryMasterEntry(merged, entry);
        });
        return merged;
      });
    })();

    return () => {
      active = false;
    };
  }, [store.id]);

  useEffect(() => {
    if (!autoPrepareNextEntry || lotteryLineCount > 0) {
      return;
    }
    const activeEntries = sortedLotteryCatalog.filter((entry) => isLotteryUsable(entry));
    if (activeEntries.length === 0) {
      return;
    }
    const snapshotLines = buildLotteryLinesFromMasterEntries(activeEntries);
    if (snapshotLines.length === 0) {
      return;
    }
    form.setValue("lottery_lines", snapshotLines, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false
    });
  }, [autoPrepareNextEntry, form, lotteryLineCount, sortedLotteryCatalog]);

  const resetLotteryConfigForm = (open = false) => {
    setLotteryConfigForm(
      createLotteryConfigFormState(sortedLotteryCatalog, store.scratch_bundle_size_default)
    );
    setIsLotteryConfigFormOpen(open);
  };

  const openCreateLotteryConfigForm = () => {
    resetLotteryConfigForm(true);
  };

  const openEditLotteryConfigForm = (entry: LotteryMasterEntry) => {
    setLotteryConfigForm(
      createLotteryMasterFormState({
        entry,
        nextDisplayNumber: getNextLotteryDisplayNumber(sortedLotteryCatalog),
        defaultBundleSize: store.scratch_bundle_size_default,
        defaultLocked: true
      })
    );
    setIsLotteryConfigFormOpen(true);
  };

  const upsertLotteryInCurrentDraft = (entry: LotteryMasterEntry) => {
    const currentLines = form.getValues("lottery_lines") ?? [];
    const result = upsertLotteryMasterEntryInDraftLines({
      currentLines,
      entry
    });
    if (!result.added && !result.updated) {
      return false;
    }
    form.setValue("lottery_lines", result.lines, {
      shouldDirty: true,
      shouldTouch: false,
      shouldValidate: false
    });
    return true;
  };

  const saveLotteryOfflineAndQueue = async (entry: LotteryMasterEntry) => {
    await offlineDb.lotteryMasterEntries.put({ ...entry, _dirty: true });
    await enqueueMutation({
      type: "UPSERT_LOTTERY_MASTER",
      store_id: entry.store_id,
      entity_id: entry.id,
      payload: entry as unknown as Record<string, unknown>
    });
  };

  const submitLotteryConfig = () => {
    if (!canManageLotteryConfig) {
      return;
    }
    const parsed = parseLotteryMasterFormState(lotteryConfigForm);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const values = parsed.data;
    if (values.is_active) {
      const { numberConflict, nameConflict } = findUsableLotteryConflicts(sortedLotteryCatalog, {
        displayNumber: values.display_number,
        name: values.name,
        excludeId: lotteryConfigForm.id
      });
      if (numberConflict) {
        toast.error("Lottery number already exists among active lotteries for this store.");
        return;
      }
      if (nameConflict) {
        toast.error("Lottery name already exists among active lotteries for this store.");
        return;
      }
    }

    const isEditing = Boolean(lotteryConfigForm.id);
    const existingEntry = isEditing
      ? sortedLotteryCatalog.find((entry) => entry.id === lotteryConfigForm.id)
      : undefined;
    const now = new Date().toISOString();
    const payload: LotteryMasterEntry = {
      id: lotteryConfigForm.id ?? crypto.randomUUID(),
      store_id: store.id,
      display_number: values.display_number,
      name: values.name,
      ticket_price: values.ticket_price,
      default_bundle_size: values.default_bundle_size,
      is_active: values.is_active,
      is_archived: false,
      archived_at: null,
      archived_by_app_user_id: null,
      is_locked: values.is_locked,
      notes: values.notes,
      created_by_app_user_id: existingEntry?.created_by_app_user_id ?? null,
      updated_by_app_user_id: existingEntry?.updated_by_app_user_id ?? null,
      created_at: existingEntry?.created_at ?? now,
      updated_at: now
    };

    startTransition(async () => {
      try {
        const response = await fetch(
          isEditing ? `/api/lottery-master/${payload.id}` : "/api/lottery-master",
          {
            method: isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isEditing
                ? {
                    display_number: payload.display_number,
                    name: payload.name,
                    ticket_price: payload.ticket_price,
                    default_bundle_size: payload.default_bundle_size,
                    is_active: payload.is_active,
                    is_locked: payload.is_locked,
                    notes: payload.notes
                  }
                : {
                    store_id: payload.store_id,
                    display_number: payload.display_number,
                    name: payload.name,
                    ticket_price: payload.ticket_price,
                    default_bundle_size: payload.default_bundle_size,
                    is_active: payload.is_active,
                    is_locked: payload.is_locked,
                    notes: payload.notes
                  }
            )
          }
        );
        const result = (await response.json().catch(() => ({}))) as {
          data?: LotteryMasterEntry;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || "Unable to save lottery.");
        }

        const saved = {
          ...payload,
          ...(result.data ?? {})
        } as LotteryMasterEntry;
        const nextCatalog = upsertLotteryMasterEntry(sortedLotteryCatalog, saved);
        setLotteryCatalog(nextCatalog);
        await offlineDb.lotteryMasterEntries.put({ ...saved, _dirty: false });
        upsertLotteryInCurrentDraft(saved);
        toast.success(isEditing ? "Lottery updated." : "Lottery added.");
        if (isEditing) {
          resetLotteryConfigForm(false);
        } else {
          setLotteryConfigForm(
            createLotteryConfigFormState(nextCatalog, store.scratch_bundle_size_default)
          );
          setIsLotteryConfigFormOpen(true);
        }
      } catch (error) {
        const localEntry = {
          ...payload,
          updated_at: new Date().toISOString()
        };
        const nextCatalog = upsertLotteryMasterEntry(sortedLotteryCatalog, localEntry);
        setLotteryCatalog(nextCatalog);
        upsertLotteryInCurrentDraft(localEntry);
        await saveLotteryOfflineAndQueue(localEntry);
        toast.info(
          error instanceof Error
            ? `${error.message} Saved locally and queued for sync.`
            : "Saved locally and queued for sync."
        );
        if (isEditing) {
          resetLotteryConfigForm(false);
        } else {
          setLotteryConfigForm(
            createLotteryConfigFormState(nextCatalog, store.scratch_bundle_size_default)
          );
          setIsLotteryConfigFormOpen(true);
        }
      }
    });
  };

  const setProductSalesTotals = ({
    taxable,
    nonTaxable
  }: {
    taxable: number;
    nonTaxable: number;
  }) => {
    const current = form.getValues("category_lines") ?? [];
    const taxableId = current.find((line) => line.taxable)?.id ?? crypto.randomUUID();
    const nonTaxableId =
      current.find((line) => !line.taxable)?.id ?? crypto.randomUUID();
    form.setValue(
      "category_lines",
      [
        {
          id: taxableId,
          category_name: "Taxable Sales",
          amount: Math.max(0, Number(taxable || 0)),
          taxable: true
        },
        {
          id: nonTaxableId,
          category_name: "Non-Taxable Sales",
          amount: Math.max(0, Number(nonTaxable || 0)),
          taxable: false
        }
      ],
      {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: false
      }
    );
  };

  const addPaymentLine = (paymentType: "cash" | "card" | "ebt" | "other") => {
    const existingLines = form.getValues("payment_lines") ?? [];
    const sameTypeCount = existingLines.filter((line) => line.payment_type === paymentType).length;
    const baseLabel =
      paymentType === "ebt"
        ? "EBT"
        : paymentType === "other"
          ? "Other"
          : paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
    paymentArray.append({
      id: crypto.randomUUID(),
      payment_type: paymentType,
      label: sameTypeCount === 0 ? baseLabel : `${baseLabel} ${sameTypeCount + 1}`,
      amount: 0,
      sort_order: existingLines.length
    });
  };

  const paymentLineIndexesByType = useMemo(() => {
    const byType = {
      cash: [] as number[],
      card: [] as number[],
      ebt: [] as number[],
      other: [] as number[]
    };
    (watched.payment_lines ?? []).forEach((line, index) => {
      const type = line.payment_type ?? "other";
      if (type === "cash" || type === "card" || type === "ebt" || type === "other") {
        byType[type].push(index);
      }
    });
    return byType;
  }, [watched.payment_lines]);

  const applyPersistedResult = (
    values: ClosingFormValues,
    result: Awaited<ReturnType<typeof saveAndMaybeSync>>
  ) => {
    form.reset(
      {
        ...values,
        id: result.id,
        status: result.status
      },
      {
        keepErrors: true,
        keepTouched: true
      }
    );
    setLastSavedStatus(result.status);
  };

  const buildClosingPayload = (status: ClosingFormValues["status"]) => {
    const values = form.getValues();
    return normalizeClosingFormValues({
      ...values,
      status,
      tax_amount_manual: values.tax_override_enabled ? values.tax_amount_manual : null,
      lottery_total_scratch_revenue: totals.lottery_total_scratch_revenue,
      lottery_amount_due: totals.lottery_amount_due,
      cash_amount: totals.cash_amount,
      card_amount: totals.card_amount,
      ebt_amount: totals.ebt_amount,
      other_amount: totals.other_amount
    }) as ClosingFormValues;
  };

  const validateClosingPayload = (status: ClosingFormValues["status"]) => {
    const candidate = buildClosingPayload(status);
    const result = closingFormSchema.safeParse(candidate);
    if (result.success) {
      return result.data;
    }
    console.error("closing_validation_failed", formatClosingValidationDiagnostics(result.error));
    toast.error(formatClosingValidationError(result.error));
    return null;
  };

  const persist = async ({
    status,
    action,
    successToast = true
  }: {
    status: ClosingFormValues["status"];
    action: ActionIntent;
    successToast?: boolean;
  }) => {
    if (role === "STAFF" && readOnly) {
      toast.error("This closing has been locked. Contact admin for changes.");
      return null;
    }

    const payload = validateClosingPayload(status);
    if (!payload) {
      return null;
    }

    setActiveAction(action);
    try {
      const result = await saveAndMaybeSync({
        values: payload,
        role,
        requireServer: status !== "DRAFT"
      });
      applyPersistedResult(payload, result);
      if (successToast) {
        toast.success(
          result.status === "DRAFT"
            ? result.persisted === "offline"
              ? "Draft saved locally. It will sync when online."
              : "Draft saved."
            : result.status === "SUBMITTED"
              ? "Closing submitted. This closing has been locked. Contact admin for changes."
              : result.status === "FINALIZED"
                ? "Closing finalized. This closing has been locked. Contact admin for changes."
                : "Closing locked."
        );
      }
      return {
        ...result,
        values: payload
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
      return null;
    } finally {
      setActiveAction(null);
    }
  };

  const shouldFallbackToOfflinePdf = (error: unknown) => {
    if (!(error instanceof Error)) {
      return true;
    }
    return (
      error.message === "offline-pdf-fallback" ||
      error.message === "Server PDF generation unavailable." ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    );
  };

  const generatePdf = async () => {
    if (!allowPrintPdf && role === "STAFF") {
      toast.error("PDF printing is disabled for staff.");
      return;
    }
    setActiveAction("pdf");
    try {
      const draftStatus = watched.status ?? "DRAFT";
      const validatedValues = validateClosingPayload(draftStatus);
      if (!validatedValues) {
        return;
      }

      let values = validatedValues;
      if (!readOnly && form.formState.isDirty) {
        const saved = await saveAndMaybeSync({
          values: validatedValues,
          role,
          requireServer: false
        });
        applyPersistedResult(validatedValues, saved);
        values = {
          ...validatedValues,
          id: saved.id,
          status: saved.status
        };
        if (saved.persisted === "offline") {
          throw new Error("offline-pdf-fallback");
        }
      }

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
              { name: "Cash", value: totals.cash_amount },
              { name: "Card", value: totals.card_amount },
              { name: "EBT", value: totals.ebt_amount },
              { name: "Other", value: totals.other_amount }
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
    } catch (error) {
      if (!shouldFallbackToOfflinePdf(error)) {
        toast.error(error instanceof Error ? error.message : "Unable to generate PDF.");
        return;
      }
      const values = validateClosingPayload(watched.status ?? "DRAFT");
      if (!values) {
        return;
      }
      const bytes = await generateOfflineClosingPdf({
        store,
        closing: values,
        generatedAtIso: new Date().toISOString()
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
    } finally {
      setActiveAction(null);
    }
  };

  const isActionBusy = pending || activeAction !== null;

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
          <section className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Lottery Scratch Tickets</h3>
                <p className="text-xs text-white/65">
                  Locked lottery rows are reusable nightly. Enter Start and End only.
                </p>
              </div>
              {canManageLotteryConfig && (
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
                  onClick={() => {
                    if (isLotteryConfigFormOpen) {
                      resetLotteryConfigForm(false);
                      return;
                    }
                    openCreateLotteryConfigForm();
                  }}
                >
                  {isLotteryConfigFormOpen ? "Close" : "Add Lottery"}
                </button>
              )}
            </div>

            <input
              type="hidden"
              {...form.register("draw_sales", {
                setValueAs: (value) =>
                  value === "" || value === null || value === undefined ? 0 : Number(value)
              })}
            />
            <input
              type="hidden"
              {...form.register("draw_payouts", {
                setValueAs: (value) =>
                  value === "" || value === null || value === undefined ? 0 : Number(value)
              })}
            />
            <input
              type="hidden"
              {...form.register("lottery_total_scratch_revenue", {
                setValueAs: (value) =>
                  value === "" || value === null || value === undefined ? 0 : Number(value)
              })}
            />
            <input
              type="hidden"
              {...form.register("lottery_amount_due", {
                setValueAs: (value) =>
                  value === "" || value === null || value === undefined ? 0 : Number(value)
              })}
            />

            {canManageLotteryConfig && isLotteryConfigFormOpen && (
              <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                    {lotteryConfigForm.id ? "Edit Lottery" : "Add Lottery"}
                  </h4>
                  <button
                    type="button"
                    className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                    onClick={() => resetLotteryConfigForm(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="field-label">Lottery Number</label>
                    <input
                      className="field"
                      type="number"
                      aria-label="Lottery Number"
                      min={1}
                      value={lotteryConfigForm.display_number}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          display_number: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Lottery Name</label>
                    <input
                      className="field"
                      aria-label="Lottery Name"
                      value={lotteryConfigForm.name}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Amount</label>
                    <input
                      className="field"
                      type="number"
                      aria-label="Lottery Amount"
                      step="0.01"
                      min={0}
                      value={lotteryConfigForm.ticket_price}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          ticket_price: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label">Default Bundle Size</label>
                    <input
                      className="field"
                      type="number"
                      aria-label="Default Bundle Size"
                      min={1}
                      value={lotteryConfigForm.default_bundle_size}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          default_bundle_size: event.target.value
                        }))
                      }
                    />
                  </div>
                  <label className="mt-5 inline-flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={lotteryConfigForm.is_active}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          is_active: event.target.checked
                        }))
                      }
                    />
                    Active
                  </label>
                  <label className="mt-5 inline-flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={lotteryConfigForm.is_locked}
                      onChange={(event) =>
                        setLotteryConfigForm((current) => ({
                          ...current,
                          is_locked: event.target.checked
                        }))
                      }
                    />
                    Locked
                  </label>
                </div>
                <div className="mt-2">
                  <label className="field-label">Notes (optional)</label>
                  <textarea
                    className="field"
                    aria-label="Lottery Notes"
                    rows={2}
                    value={lotteryConfigForm.notes}
                    onChange={(event) =>
                      setLotteryConfigForm((current) => ({
                        ...current,
                        notes: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-brand-crimson/40 bg-brand-crimson/20 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-crimson/30 disabled:opacity-60"
                    disabled={pending}
                    onClick={submitLotteryConfig}
                  >
                    {pending
                      ? "Saving..."
                      : lotteryConfigForm.id
                        ? "Save Lottery"
                        : "Add Lottery"}
                  </button>
                  {lotteryConfigForm.id && (
                    <button
                      type="button"
                      className="rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10"
                      onClick={openCreateLotteryConfigForm}
                    >
                      Add New
                    </button>
                  )}
                </div>
              </div>
            )}

            {lotteryArray.fields.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wide text-white/65">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Start</th>
                      <th className="px-3 py-2">End</th>
                      <th className="px-3 py-2">Sold</th>
                      <th className="px-3 py-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotteryRowIndexes.map((index) => {
                      const line = watched.lottery_lines?.[index];
                      const field = lotteryArray.fields[index];
                      const sourceEntry =
                        line?.lottery_master_entry_id === null ||
                        line?.lottery_master_entry_id === undefined
                          ? null
                          : sortedLotteryCatalog.find(
                              (entry) => entry.id === line.lottery_master_entry_id
                            ) ?? null;
                      const lineSnapshot = {
                        id: String(line?.id ?? field.id),
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
                        inclusiveCount: false,
                        bundleSize: lineSnapshot.bundle_size_snapshot
                      });

                      return (
                        <tr key={field.fieldKey} className="border-t border-white/10 align-top">
                          <td className="px-3 py-2 font-semibold">
                            {lineSnapshot.display_number_snapshot}
                            <input
                              type="hidden"
                              {...form.register(`lottery_lines.${index}.id`)}
                            />
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
                              {...form.register(`lottery_lines.${index}.lottery_name_snapshot`)}
                            />
                            <input
                              type="hidden"
                              {...form.register(`lottery_lines.${index}.ticket_price_snapshot`, {
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
                            <input
                              type="hidden"
                              {...form.register(`lottery_lines.${index}.inclusive_count`)}
                            />
                            <input
                              type="hidden"
                              {...form.register(`lottery_lines.${index}.payouts`, {
                                setValueAs: (value) =>
                                  value === "" || value === null || value === undefined
                                    ? 0
                                    : Number(value)
                              })}
                            />
                            <input
                              type="hidden"
                              {...form.register(`lottery_lines.${index}.scratch_payouts`, {
                                setValueAs: (value) =>
                                  value === "" || value === null || value === undefined
                                    ? 0
                                    : Number(value)
                                })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{lineSnapshot.lottery_name_snapshot}</span>
                              {lineSnapshot.is_locked_snapshot && (
                                <span className="rounded-full border border-amber-300/35 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                  Locked
                                </span>
                              )}
                              {canManageLotteryConfig && sourceEntry && (
                                <button
                                  type="button"
                                  className="rounded border border-white/20 px-2 py-0.5 text-[10px] hover:bg-white/10"
                                  onClick={() => openEditLotteryConfigForm(sourceEntry)}
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {formatCurrency(Number(lineSnapshot.ticket_price_snapshot ?? 0))}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="field w-28"
                              type="number"
                              disabled={readOnly}
                              {...form.register(`lottery_lines.${index}.start_number`, {
                                setValueAs: (value) =>
                                  value === "" || value === null || value === undefined
                                    ? undefined
                                    : Number(value)
                              })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="field w-28"
                              type="number"
                              disabled={readOnly}
                              {...form.register(`lottery_lines.${index}.end_number`, {
                                setValueAs: (value) =>
                                  value === "" || value === null || value === undefined
                                    ? undefined
                                    : Number(value)
                              })}
                            />
                            {!rangeState.isValid && (
                              <p className="mt-1 text-[10px] text-red-300">{rangeState.error}</p>
                            )}
                            {rangeState.warning && (
                              <p className="mt-1 text-[10px] text-amber-200">{rangeState.warning}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold">{computed.ticketsSold}</td>
                          <td className="px-3 py-2 font-semibold">
                            {formatCurrency(computed.salesAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {lotteryArray.fields.length === 0 && (
              role === "ADMIN" ? (
                <div className="rounded-xl border border-brand-crimson/30 bg-brand-crimson/10 p-4">
                  <p className="text-sm font-semibold text-white">
                    No active lotteries are configured for this store yet.
                  </p>
                  <p className="mt-1 text-xs text-white/75">
                    Add a lottery here and it will appear immediately for nightly entry.
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-brand-crimson/40 bg-brand-crimson/20 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-crimson/30"
                    onClick={openCreateLotteryConfigForm}
                  >
                    Add Lottery
                  </button>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 p-3 text-xs text-amber-100">
                  No active lottery setup found for this store. Ask an admin to configure Lottery
                  Setup.
                </p>
              )
            )}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/65">
                  Total Scratch Revenue
                </p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(totals.lottery_total_scratch_revenue)}
                </p>
              </div>
              <div>
                <label className="field-label">Online</label>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={readOnly}
                  {...form.register("lottery_online_amount", {
                    setValueAs: (value) =>
                      value === "" || value === null || value === undefined ? 0 : Number(value)
                  })}
                />
              </div>
              <div>
                <label className="field-label">Paid Out</label>
                <input
                  className="field"
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={readOnly}
                  {...form.register("lottery_paid_out_amount", {
                    setValueAs: (value) =>
                      value === "" || value === null || value === undefined ? 0 : Number(value)
                  })}
                />
              </div>
              <div className="rounded-lg border border-brand-crimson/35 bg-brand-crimson/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-white/75">Amount Due</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(totals.lottery_amount_due)}</p>
              </div>
            </div>

            <p className="text-xs text-white/65">
              Amount Due = (Total Scratch Revenue - Paid Out) + Online
            </p>
          </section>
        )}

        {stepIndex === 2 && (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Billpay</h3>
            {billpayArray.fields.map((field, index) => (
              <div key={field.fieldKey} className="grid gap-2 sm:grid-cols-4">
                <input type="hidden" {...form.register(`billpay_lines.${index}.id`)} />
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

        {stepIndex === 3 && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold">Payments & Tax</h3>
            <input type="hidden" {...form.register("cash_amount", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("card_amount", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("ebt_amount", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("other_amount", { valueAsNumber: true })} />

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                Product Sales Summary
              </h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="field-label">Taxable Sales</label>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={readOnly}
                    value={taxableSalesInput}
                    onChange={(event) =>
                      setProductSalesTotals({
                        taxable: Number(event.target.value || 0),
                        nonTaxable: nonTaxableSalesInput
                      })
                    }
                  />
                </div>
                <div>
                  <label className="field-label">Non-Taxable Sales</label>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={readOnly}
                    value={nonTaxableSalesInput}
                    onChange={(event) =>
                      setProductSalesTotals({
                        taxable: taxableSalesInput,
                        nonTaxable: Number(event.target.value || 0)
                      })
                    }
                  />
                </div>
                <div className="rounded-lg border border-brand-crimson/35 bg-brand-crimson/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-white/75">
                    Product Sales Total
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {formatCurrency(totals.product_sales_total)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-white/80">Tax</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
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
                    min={0}
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
                    min={0}
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
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Taxable Sales: <strong>{formatCurrency(totals.taxable_sales)}</strong>
                </p>
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Non-Taxable Sales: <strong>{formatCurrency(totals.non_taxable_sales)}</strong>
                </p>
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Tax Rate: <strong>{(Number(watched.tax_rate_used ?? 0) * 100).toFixed(2)}%</strong>
                </p>
                <p className="rounded border border-brand-crimson/35 bg-brand-crimson/10 px-3 py-2 text-xs">
                  Tax Total: <strong>{formatCurrency(totals.tax_amount)}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                  Payments
                </h4>
                {!readOnly && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() => addPaymentLine("cash")}
                    >
                      Add Cash
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() => addPaymentLine("card")}
                    >
                      Add Card
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() => addPaymentLine("ebt")}
                    >
                      Add EBT
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      onClick={() => addPaymentLine("other")}
                    >
                      Add Other
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {(["cash", "card", "ebt", "other"] as const).map((type) => (
                  <div key={type} className="rounded-lg border border-white/10 p-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">
                      {type === "ebt" ? "EBT" : type}
                    </p>
                    {paymentLineIndexesByType[type].length === 0 && (
                      <p className="text-xs text-white/55">No {type} lines.</p>
                    )}
                    <div className="space-y-2">
                      {paymentLineIndexesByType[type].map((index) => (
                        <div
                          key={paymentArray.fields[index]?.fieldKey ?? index}
                          className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
                        >
                          <input
                            type="hidden"
                            {...form.register(`payment_lines.${index}.id`)}
                          />
                          <input
                            type="hidden"
                            {...form.register(`payment_lines.${index}.payment_type`)}
                          />
                          <input
                            type="hidden"
                            {...form.register(`payment_lines.${index}.sort_order`, {
                              valueAsNumber: true
                            })}
                          />
                          <input
                            className="field"
                            disabled={readOnly}
                            placeholder="Label"
                            {...form.register(`payment_lines.${index}.label`)}
                          />
                          <input
                            className="field"
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={readOnly}
                            {...form.register(`payment_lines.${index}.amount`, {
                              setValueAs: (value) =>
                                value === "" || value === null || value === undefined
                                  ? 0
                                  : Number(value)
                            })}
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                              onClick={() => paymentArray.remove(index)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Total Cash: <strong>{formatCurrency(totals.cash_amount)}</strong>
                </p>
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Total Card: <strong>{formatCurrency(totals.card_amount)}</strong>
                </p>
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Total EBT: <strong>{formatCurrency(totals.ebt_amount)}</strong>
                </p>
                <p className="rounded border border-white/10 px-3 py-2 text-xs">
                  Total Other: <strong>{formatCurrency(totals.other_amount)}</strong>
                </p>
                <p className="rounded border border-brand-crimson/35 bg-brand-crimson/10 px-3 py-2 text-xs">
                  Grand Payments Total: <strong>{formatCurrency(totals.payments_total)}</strong>
                </p>
              </div>
            </div>
          </section>
        )}

        {stepIndex === 4 && (
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

        {stepIndex === 5 && (
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
                Scratch revenue:{" "}
                <strong>{formatCurrency(totals.lottery_total_scratch_revenue)}</strong>
              </p>
              <p className="rounded-lg border border-white/10 p-3 text-sm">
                Lottery amount due: <strong>{formatCurrency(totals.lottery_amount_due)}</strong>
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
              disabled={isActionBusy || readOnly}
              onClick={() => void persist({ status: "DRAFT", action: "draft" })}
            >
              {activeAction === "draft" ? "Saving..." : "Save Draft"}
            </button>
            <DepthButton
              type="button"
              disabled={isActionBusy || readOnly}
              onClick={async () => {
                const ok = window.confirm(
                  "After submission, staff cannot edit this entry. Continue?"
                );
                if (!ok) {
                  return;
                }
                await persist({ status: "SUBMITTED", action: "submit" });
              }}
            >
              {activeAction === "submit" ? "Submitting..." : "Submit Closing"}
            </DepthButton>
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={isActionBusy || readOnly}
              onClick={async () => {
                const ok = window.confirm(
                  "Finalize this closing? Staff will not be able to edit afterward."
                );
                if (!ok) {
                  return;
                }
                await persist({ status: "FINALIZED", action: "finalize" });
              }}
            >
              {activeAction === "finalize" ? "Finalizing..." : "Finalize Closing"}
            </button>
            {role === "ADMIN" && (
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                disabled={isActionBusy}
                onClick={async () => {
                  const ok = window.confirm("Lock this closing now?");
                  if (!ok) {
                    return;
                  }
                  await persist({ status: "LOCKED", action: "lock" });
                }}
              >
                {activeAction === "lock" ? "Locking..." : "Lock Entry"}
              </button>
            )}
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              disabled={isActionBusy || (role === "STAFF" && !allowPrintPdf)}
              onClick={generatePdf}
            >
              {activeAction === "pdf" ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
