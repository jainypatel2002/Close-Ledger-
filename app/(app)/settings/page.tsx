import { requireAdmin } from "@/lib/auth";
import { deleteActiveStoreAction, updateStoreAction } from "@/app/actions/store";
import { StoreProfileForm } from "@/components/store/store-profile-form";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { TiltCard } from "@/components/ui/tilt-card";
import Link from "next/link";

export default async function SettingsPage() {
  const context = await requireAdmin();
  const store = context.activeStore!;
  const submitAction = updateStoreAction.bind(null, store.id);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-white/70">
          Admin-only controls for store configuration and setup.
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-white/60">
          Active Store: {store.store_name}
        </p>
      </header>

      <SettingsSubnav />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TiltCard>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Store Profile
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Business details, defaults, and tax behavior used during closing.
          </p>
          <a
            href="#store-profile-settings"
            className="mt-3 inline-flex rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
          >
            Edit Store Profile
          </a>
        </TiltCard>

        <TiltCard>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Team / Staff
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Manage team roles and staff permissions for this store.
          </p>
          <Link
            href="/team"
            className="mt-3 inline-flex rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
          >
            Open Team Settings
          </Link>
        </TiltCard>

        <TiltCard>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Lottery Setup
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Configure scratch ticket lotteries so they appear automatically in nightly closing.
          </p>
          <Link
            href={"/settings/lottery" as never}
            className="mt-3 inline-flex rounded-lg border border-brand-crimson/40 bg-brand-crimson/15 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-crimson/25"
          >
            Open Lottery Setup
          </Link>
        </TiltCard>

        <TiltCard>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Theme / Preferences
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Switch the app theme from the top bar to match your working environment.
          </p>
          <span className="mt-3 inline-flex rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70">
            Use Theme Toggle In Header
          </span>
        </TiltCard>
      </section>

      <section id="store-profile-settings" className="surface p-5">
        <StoreProfileForm
          initialStore={store}
          submitAction={submitAction}
          submitLabel="Save settings"
        />
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
