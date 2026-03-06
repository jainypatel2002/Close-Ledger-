import { createStoreAction, switchStoreAction } from "@/app/actions/store";
import { requireAdmin } from "@/lib/auth";
import { StoreProfileForm } from "@/components/store/store-profile-form";

export default async function StoresPage() {
  const context = await requireAdmin();

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xl font-bold">Store Management</h2>
        <p className="text-sm text-white/70">
          Create additional stores and switch active workspace.
        </p>
      </section>

      <section className="surface p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
          Your stores
        </h3>
        <div className="space-y-2">
          {context.stores.map((store) => (
            <form
              key={store.id}
              action={switchStoreAction.bind(null, store.id)}
              className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
            >
              <div>
                <p>{store.store_name}</p>
                <p className="text-xs text-white/60">
                  {store.city}, {store.state}
                </p>
              </div>
              <button
                type="submit"
                className="rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
                disabled={store.id === context.activeStore?.id}
              >
                {store.id === context.activeStore?.id ? "Active" : "Switch"}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="surface p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
          Create new store
        </h3>
        <StoreProfileForm submitAction={createStoreAction} submitLabel="Create store" />
      </section>
    </div>
  );
}
