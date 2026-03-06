import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { MainNav } from "@/components/layout/main-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { StoreSwitcher } from "@/components/store/store-switcher";
import { SyncBadge } from "@/components/sync/sync-badge";
import { SessionContext } from "@/lib/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { canAccessHistory } from "@/lib/permissions";

interface AppShellProps {
  context: SessionContext;
  children: ReactNode;
}

export const AppShell = ({ context, children }: AppShellProps) => (
  <div className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/45 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">Nightly Closing</h1>
          <Badge
            label={context.membership?.role ?? "STAFF"}
            variant={context.membership?.role === "ADMIN" ? "admin" : "staff"}
          />
          <SyncBadge />
        </div>

        <div className="flex items-center gap-3">
          <StoreSwitcher
            stores={context.stores}
            activeStoreId={context.activeStore?.id ?? null}
          />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-3">
        <MainNav
          membership={context.membership}
          canViewHistory={
            context.activeStore
              ? canAccessHistory(context.membership, context.activeStore)
              : false
          }
        />
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
  </div>
);
