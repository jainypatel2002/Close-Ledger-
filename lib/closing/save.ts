"use client";

import { toast } from "sonner";
import {
  closingFormSchema,
  formatClosingValidationError,
  normalizeClosingFormValues
} from "@/lib/validation/closing";
import { Role } from "@/lib/types";
import { ClosingFormValues } from "@/lib/validation/closing";
import { offlineDb } from "@/lib/offline/db";
import { enqueueMutation } from "@/lib/offline/sync";
import { ZodError } from "zod";

const isLockedForStaff = (role: Role, status: ClosingFormValues["status"]) =>
  role === "STAFF" && status !== "DRAFT";

const isBrowserOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const saveClosingToServer = async (values: ClosingFormValues) => {
  const response = await fetch("/api/closings/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values)
  });
  const rawText = await response.text();
  const payload = (() => {
    try {
      return JSON.parse(rawText) as {
        id?: string;
        status?: ClosingFormValues["status"];
        error?: string;
      };
    } catch {
      return {} as {
        id?: string;
        status?: ClosingFormValues["status"];
        error?: string;
      };
    }
  })();
  const fallbackError =
    rawText.trim().length > 0
      ? rawText.trim().slice(0, 240)
      : `Unable to save closing (HTTP ${response.status}).`;
  if (!response.ok || !payload.id || !payload.status) {
    throw new Error(payload.error || fallbackError);
  }
  return {
    id: payload.id,
    status: payload.status
  };
};

const removeQueuedClosingMutations = async (closingIds: string[]) => {
  if (closingIds.length === 0) {
    return;
  }
  const queue = await offlineDb.mutations.where("type").equals("UPSERT_CLOSING").toArray();
  const ids = queue
    .filter((mutation) => {
      const entityId = String(mutation.entity_id ?? "");
      return closingIds.includes(entityId);
    })
    .map((mutation) => mutation.id);
  if (ids.length > 0) {
    await offlineDb.mutations.bulkDelete(ids);
  }
};

const saveClosingLocallyAsSynced = async ({
  values,
  id,
  status
}: {
  values: ClosingFormValues;
  id: string;
  status: ClosingFormValues["status"];
}) => {
  const now = new Date().toISOString();
  const next = {
    ...values,
    id,
    status,
    updated_at: now,
    _dirty: false
  };
  if (id !== values.id) {
    await offlineDb.closings.delete(values.id);
  }
  await offlineDb.closings.put(next);
  await removeQueuedClosingMutations(
    [...new Set([values.id, id].filter((closingId) => Boolean(closingId)))]
  );
};

export const saveClosingLocallyAndQueue = async ({
  values,
  role
}: {
  values: ClosingFormValues;
  role: Role;
}) => {
  let parsed: ClosingFormValues;
  try {
    parsed = closingFormSchema.parse(normalizeClosingFormValues(values));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatClosingValidationError(error));
    }
    throw error;
  }
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
  role,
  requireServer = false
}: {
  values: ClosingFormValues;
  role: Role;
  requireServer?: boolean;
}) => {
  let parsed: ClosingFormValues;
  try {
    parsed = closingFormSchema.parse(normalizeClosingFormValues(values));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatClosingValidationError(error));
    }
    throw error;
  }

  if (requireServer && !isBrowserOnline()) {
    throw new Error("You are offline. Submit/finalize requires an online sync.");
  }

  if (!isBrowserOnline()) {
    await saveClosingLocallyAndQueue({ values: parsed, role });
    toast.info("Saved offline. This will sync automatically when online.");
    return {
      id: parsed.id,
      status: parsed.status,
      persisted: "offline" as const
    };
  }

  const saved = await saveClosingToServer(parsed);
  await saveClosingLocallyAsSynced({
    values: parsed,
    id: saved.id,
    status: saved.status
  });
  return {
    id: saved.id,
    status: saved.status,
    persisted: "server" as const
  };
};
