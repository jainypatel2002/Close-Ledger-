import { requireAdmin } from "@/lib/auth";
import { deleteActiveStoreAction, updateStoreAction } from "@/app/actions/store";
import { StoreProfileForm } from "@/components/store/store-profile-form";
import Link from "next/link";

export default async function SettingsPage() {
  const context = await requireAdmin();
  const store = context.activeStore!;
  const submitAction = updateStoreAction.bind(null, store.id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">Store Settings</h2>
        <p className="text-sm text-white/70">
          Admin-only controls for defaults, tax behavior, and staff visibility.
        </p>
      </header>
      <section className="surface p-5">
        <StoreProfileForm
          initialStore={store}
          submitAction={submitAction}
          submitLabel="Save settings"
        />
      </section>
      <section className="surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Lottery Catalog
        </h3>
        <p className="mt-2 text-sm text-white/70">
          Configure store lottery names, display order, ticket prices, and locked daily entries.
        </p>
        <Link
          href={"/settings/lottery" as never}
          className="mt-3 inline-flex rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
        >
          Open Lottery Setup
        </Link>
      </section>
      <section className="surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Danger zone
        </h3>
        <p className="mt-2 text-sm text-white/70">
          Delete this store and all closings, line items, and documents.
        </p>
        <form action={deleteActiveStoreAction} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-red-400/50 bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-600/30"
          >
            Delete store
          </button>
        </form>
      </section>
    </div>
  );
}
