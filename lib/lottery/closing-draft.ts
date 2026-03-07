import { createEmptyClosing } from "@/lib/closing/defaults";
import { buildLotteryLineFromMasterEntry } from "@/lib/lottery/snapshots";
import { LotteryMasterEntry, Store } from "@/lib/types";
import { ClosingFormValues } from "@/lib/validation/closing";

const sortByDisplayNumber = (entries: LotteryMasterEntry[]) =>
  [...entries].sort((a, b) => a.display_number - b.display_number || a.name.localeCompare(b.name));

export const sortLotteryMasterEntries = (entries: LotteryMasterEntry[]) =>
  sortByDisplayNumber(entries);

export const getNextLotteryDisplayNumber = (entries: LotteryMasterEntry[]) =>
  Math.max(1, (sortByDisplayNumber(entries).at(-1)?.display_number ?? 0) + 1);

export const upsertLotteryMasterEntry = (
  entries: LotteryMasterEntry[],
  entry: LotteryMasterEntry
) =>
  sortByDisplayNumber([...entries.filter((item) => item.id !== entry.id), entry]);

export const appendLotteryMasterEntryToDraftLines = ({
  currentLines,
  entry
}: {
  currentLines: ClosingFormValues["lottery_lines"];
  entry: LotteryMasterEntry;
}) => {
  if (!entry.is_active) {
    return currentLines;
  }
  if (
    currentLines.some((line) => line.lottery_master_entry_id && line.lottery_master_entry_id === entry.id)
  ) {
    return currentLines;
  }
  return [...currentLines, buildLotteryLineFromMasterEntry(entry)];
};

export const syncLotteryMasterEntryToDraftLines = ({
  currentLines,
  entry
}: {
  currentLines: ClosingFormValues["lottery_lines"];
  entry: LotteryMasterEntry;
}) => {
  let updated = false;
  const lines = currentLines.map((line) => {
    if (line.lottery_master_entry_id !== entry.id) {
      return line;
    }

    updated = true;
    return {
      ...line,
      display_number_snapshot: entry.display_number,
      lottery_name_snapshot: entry.name,
      ticket_price_snapshot: Number(entry.ticket_price ?? 0),
      bundle_size_snapshot: Number(entry.default_bundle_size ?? 100),
      is_locked_snapshot: Boolean(entry.is_locked)
    };
  });

  return { lines, updated };
};

export const upsertLotteryMasterEntryInDraftLines = ({
  currentLines,
  entry
}: {
  currentLines: ClosingFormValues["lottery_lines"];
  entry: LotteryMasterEntry;
}) => {
  const synced = syncLotteryMasterEntryToDraftLines({
    currentLines,
    entry
  });
  const lines = appendLotteryMasterEntryToDraftLines({
    currentLines: synced.lines,
    entry
  });

  return {
    lines,
    updated: synced.updated,
    added: lines.length !== synced.lines.length
  };
};

export const appendMissingActiveLotteryEntriesToDraftLines = ({
  currentLines,
  entries
}: {
  currentLines: ClosingFormValues["lottery_lines"];
  entries: LotteryMasterEntry[];
}) => {
  let lines = [...currentLines];
  let added = false;
  sortByDisplayNumber(entries)
    .filter((entry) => entry.is_active)
    .forEach((entry) => {
      const updated = appendLotteryMasterEntryToDraftLines({
        currentLines: lines,
        entry
      });
      if (updated.length !== lines.length) {
        added = true;
        lines = updated;
      }
    });
  return { lines, added };
};

export const buildNextClosingDraftForLotteryWorkflow = ({
  store,
  lotteryMasterEntries,
  businessDate
}: {
  store: Store;
  lotteryMasterEntries: LotteryMasterEntry[];
  businessDate: string;
}) => {
  const nextDraft = createEmptyClosing(
    store,
    sortByDisplayNumber(lotteryMasterEntries).filter((entry) => entry.is_active)
  );
  nextDraft.business_date = businessDate;
  return nextDraft;
};
