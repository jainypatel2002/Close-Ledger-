import { PermissionMap } from "@/lib/types";

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_SCRATCH_BUNDLE_SIZE = 100;
export const DEFAULT_TAX_RATE = 0.0625;

export const ADMIN_DEFAULT_PERMISSIONS: PermissionMap = {
  can_create_closing: true,
  can_export_data: true,
  can_print_pdf: true,
  can_view_history: true,
  can_view_only_own_entries: false,
  can_view_reports: true
};

export const STAFF_DEFAULT_PERMISSIONS: PermissionMap = {
  can_create_closing: true,
  can_export_data: false,
  can_print_pdf: false,
  can_view_history: false,
  can_view_only_own_entries: true,
  can_view_reports: false
};

export const CLOSING_STATUS_ORDER = {
  DRAFT: 0,
  SUBMITTED: 1,
  FINALIZED: 2,
  LOCKED: 3
} as const;
