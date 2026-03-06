import { ClosingStatus, Role } from "@/lib/types";

export const canModifyExistingClosing = ({
  role,
  existingStatus,
  createdBy,
  userId
}: {
  role: Role;
  existingStatus: ClosingStatus;
  createdBy: string | null;
  userId: string;
}) => {
  if (role === "ADMIN") {
    return true;
  }
  return existingStatus === "DRAFT" && createdBy === userId;
};

export const canDeleteClosing = (role: Role) => role === "ADMIN";

export const canAccessAdminRoute = (role: Role) => role === "ADMIN";
