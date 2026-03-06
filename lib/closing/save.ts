"use client";

import { toast } from "sonner";
import { closingFormSchema } from "@/lib/validation/closing";
import { Role } from "@/lib/types";
import { ClosingFormValues } from "@/lib/validation/closing";
import { offlineDb } from "@/lib/offline/db";
import { enqueueMutation, syncNow } from "@/lib/offline/sync";

const isLockedForStaff = (role: Role, status: ClosingFormValues["status"]) =>
  role === "STAFF" && status !== "DRAFT";

export const saveClosingLocallyAndQueue = async ({
  values,
  role
}: {
  values: ClosingFormValues;
  role: Role;
}) => {
  const parsed = closingFormSchema.parse(values);
  const existing = await offlineDb.closings.get(parsed.id);
  if (existing && isLockedForStaff(role, existing.status)) {
    throw new Error("This record is locked or you do not have permission to edit it.");
  }

  if (isLockedForStaff(role, parsed.status) && existing?.status !== "DRAFT") {
    throw new Error("This record is locked or you do not have permission to edit it.");
  }

  await offlineDb.closings.put({
    ...parsed,
    updated_at: new Date().toISOString(),
    _dirty: true
  });

  await enqueueMutation({
    type: "UPSERT_CLOSING",
    store_id: parsed.store_id,
    entity_id: parsed.id,
    payload: parsed
  });
};

export const saveAndMaybeSync = async ({
  values,
  role
}: {
  values: ClosingFormValues;
  role: Role;
}) => {
  await saveClosingLocallyAndQueue({ values, role });
  if (typeof navigator !== "undefined" && navigator.onLine) {
    const result = await syncNow();
    if (result.failed > 0) {
      throw new Error("Saved locally, but sync failed for one or more updates.");
    }
  } else {
    toast.info("Saved offline. This will sync automatically when online.");
  }
};
