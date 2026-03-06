import { requireSessionContext } from "@/lib/auth";
import { ClosingWizard } from "@/components/closing/closing-wizard";
import { getTodayClosingForStore, getClosingById } from "@/lib/data/closings";
import { toClosingFormValues } from "@/lib/closing/mapper";
import { can, canPrintPdf } from "@/lib/permissions";
import { getLotteryMasterEntriesForStore } from "@/lib/data/lottery-master";
import { createEmptyClosing } from "@/lib/closing/defaults";
import { OfflineHydrator } from "@/components/sync/offline-hydrator";

export default async function NewClosingPage() {
  const context = await requireSessionContext();
  const store = context.activeStore!;
  const role = context.membership?.role ?? "STAFF";
  const lotteryMasterEntries = await getLotteryMasterEntriesForStore({
    storeId: store.id,
    onlyActive: true
  });

  if (!can(context.membership, "can_create_closing")) {
    return (
      <div className="surface p-5 text-sm">
        You do not have permission to create closings for this store.
      </div>
    );
  }

  const todayClosing = await getTodayClosingForStore(store.id);
  const initialValue =
    todayClosing && (role === "ADMIN" || todayClosing.created_by === context.userId)
      ? toClosingFormValues(await getClosingById(todayClosing.id))
      : createEmptyClosing(store, lotteryMasterEntries);

  return (
    <div className="space-y-3">
      <OfflineHydrator stores={[store]} lotteryMasterEntries={lotteryMasterEntries} />
      <header>
        <h2 className="text-xl font-bold">Nightly Closing Wizard</h2>
        <p className="text-sm text-white/70">
          Staff can edit only their DRAFT entries. Submission locks editing.
        </p>
      </header>
      <ClosingWizard
        store={store}
        role={role}
        initialValue={initialValue}
        lotteryMasterEntries={lotteryMasterEntries}
        allowPrintPdf={canPrintPdf(context.membership, store)}
        autoPrepareNextEntry
      />
    </div>
  );
}
