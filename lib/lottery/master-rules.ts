import { LotteryMasterEntry } from "@/lib/types";

export interface LotteryIdentityLike {
  id: string;
  display_number: number;
  name: string;
  is_active: boolean;
  is_archived?: boolean | null;
}

export const normalizeLotteryName = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const isLotteryArchived = (entry: Pick<LotteryIdentityLike, "is_archived">) =>
  Boolean(entry.is_archived);

export const isLotteryUsable = (
  entry: Pick<LotteryIdentityLike, "is_active" | "is_archived">
) => Boolean(entry.is_active) && !Boolean(entry.is_archived);

export const findUsableLotteryConflicts = <T extends LotteryIdentityLike>(
  entries: T[],
  {
    displayNumber,
    name,
    excludeId
  }: {
    displayNumber: number;
    name: string;
    excludeId?: string;
  }
) => {
  const normalizedName = normalizeLotteryName(name);
  const comparable = entries.filter((entry) => isLotteryUsable(entry) && entry.id !== excludeId);

  const numberConflict = comparable.find((entry) => entry.display_number === displayNumber) ?? null;
  const nameConflict =
    comparable.find((entry) => normalizeLotteryName(entry.name) === normalizedName) ?? null;

  return { numberConflict, nameConflict };
};

export const splitLotteryEntriesByStatus = (entries: LotteryMasterEntry[]) => {
  const active = entries.filter((entry) => isLotteryUsable(entry));
  const archived = entries.filter((entry) => isLotteryArchived(entry));
  const inactive = entries.filter(
    (entry) => !isLotteryArchived(entry) && !isLotteryUsable(entry)
  );
  return {
    all: entries,
    active,
    inactive,
    archived
  };
};
