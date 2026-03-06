import {
  ADMIN_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS
} from "@/lib/constants";
import { PermissionKey, PermissionMap, Role, Store, StoreMember } from "@/lib/types";

export const normalizePermissions = (
  role: Role,
  permissions: PermissionMap | null | undefined
): PermissionMap => {
  const defaults =
    role === "ADMIN" ? ADMIN_DEFAULT_PERMISSIONS : STAFF_DEFAULT_PERMISSIONS;
  return {
    ...defaults,
    ...(permissions ?? {})
  };
};

export const can = (
  membership: Pick<StoreMember, "role" | "permissions"> | null | undefined,
  permission: PermissionKey
): boolean => {
  if (!membership) {
    return false;
  }
  const merged = normalizePermissions(membership.role, membership.permissions);
  return Boolean(merged[permission]);
};

export const canAccessHistory = (
  membership: Pick<StoreMember, "role" | "permissions"> | null | undefined,
  store: Pick<Store, "allow_staff_view_history">
): boolean => {
  if (!membership) {
    return false;
  }
  if (membership.role === "ADMIN") {
    return true;
  }
  return store.allow_staff_view_history || can(membership, "can_view_history");
};

export const canPrintPdf = (
  membership: Pick<StoreMember, "role" | "permissions"> | null | undefined,
  store: Pick<Store, "allow_staff_print_pdf">
): boolean => {
  if (!membership) {
    return false;
  }
  if (membership.role === "ADMIN") {
    return true;
  }
  return store.allow_staff_print_pdf || can(membership, "can_print_pdf");
};

export const canViewReports = (
  membership: Pick<StoreMember, "role" | "permissions"> | null | undefined
): boolean => {
  if (!membership) {
    return false;
  }
  if (membership.role === "ADMIN") {
    return true;
  }
  return can(membership, "can_view_reports");
};

export const canManageTeam = (
  membership: Pick<StoreMember, "role"> | null | undefined
): boolean => membership?.role === "ADMIN";
