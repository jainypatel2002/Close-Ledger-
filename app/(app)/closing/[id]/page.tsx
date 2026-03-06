import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSessionContext } from "@/lib/auth";
import { getClosingById } from "@/lib/data/closings";
import { toClosingFormValues } from "@/lib/closing/mapper";
import { ClosingWizard } from "@/components/closing/closing-wizard";
import { canPrintPdf } from "@/lib/permissions";
import { OfflineHydrator } from "@/components/sync/offline-hydrator";
import { DeleteClosingButton } from "@/components/closing/delete-closing-button";
import { getLotteryMasterEntriesForStore } from "@/lib/data/lottery-master";

export default async function ClosingDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireSessionContext();

  try {
    const closing = await getClosingById(id);
    if (!closing?.closing) {
      notFound();
    }
    const lotteryMasterEntries = await getLotteryMasterEntriesForStore({
      storeId: context.activeStore!.id,
      onlyActive: true
    });
    return (
      <div className="space-y-3">
        <OfflineHydrator
          stores={[context.activeStore!]}
          closings={[closing.closing]}
          lotteryMasterEntries={lotteryMasterEntries}
        />
        <header>
          <h2 className="text-xl font-bold">Closing Detail</h2>
          <p className="text-sm text-white/70">
            Role-aware editing applies to this record.
          </p>
          {context.membership?.role === "ADMIN" && (
            <div className="mt-2">
              <DeleteClosingButton closingId={id} />
            </div>
          )}
        </header>
        <ClosingWizard
          store={context.activeStore!}
          role={context.membership?.role ?? "STAFF"}
          initialValue={toClosingFormValues(closing)}
          lotteryMasterEntries={lotteryMasterEntries}
          allowPrintPdf={canPrintPdf(context.membership, context.activeStore!)}
        />
        <section className="surface p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Stored PDFs
          </h3>
          <div className="mt-3 space-y-2">
            {closing.documents.map((document) => (
              <Link
                key={document.id}
                href={document.public_url ?? "#"}
                target="_blank"
                className="block rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
              >
                {document.file_name}
              </Link>
            ))}
            {closing.documents.length === 0 && (
              <p className="text-xs text-white/60">No PDFs have been stored yet.</p>
            )}
          </div>
        </section>
      </div>
    );
  } catch {
    notFound();
  }
}
