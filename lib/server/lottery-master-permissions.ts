import { Role } from "@/lib/types";

export const canManageLotteryMasterCatalog = (role: Role) => role === "ADMIN";

export const canRunLotteryMasterMaintenance = (role: Role) => role === "ADMIN";
