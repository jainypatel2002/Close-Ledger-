"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings", label: "Store Profile" },
  { href: "/settings/lottery", label: "Lottery Setup" }
];

export const SettingsSubnav = () => {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Settings sections">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/settings" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href as never}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              isActive
                ? "border-brand-crimson/40 bg-brand-crimson/20 text-white"
                : "border-white/15 text-white/75 hover:bg-white/10 hover:text-white"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
