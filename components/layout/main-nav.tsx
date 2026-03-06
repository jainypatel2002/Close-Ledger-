"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StoreMember } from "@/lib/types";
import { canManageTeam } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface MainNavProps {
  membership: StoreMember | null;
  canViewHistory: boolean;
}

export const MainNav = ({ membership, canViewHistory }: MainNavProps) => {
  const pathname = usePathname();

  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/closing/new", label: "New Closing", show: true },
    { href: "/history", label: "History", show: canViewHistory },
    {
      href: "/reports/monthly",
      label: "Reports",
      show: membership?.role === "ADMIN"
    },
    {
      href: "/team",
      label: "Team",
      show: canManageTeam(membership)
    },
    {
      href: "/stores",
      label: "Stores",
      show: membership?.role === "ADMIN"
    },
    {
      href: "/settings",
      label: "Settings",
      show: membership?.role === "ADMIN"
    },
    {
      href: "/audit",
      label: "Audit",
      show: membership?.role === "ADMIN"
    }
  ];

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {links
        .filter((link) => link.show)
        .map((link) => (
          <Link
            key={link.href}
            href={link.href as never}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              pathname.startsWith(link.href)
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            {link.label}
          </Link>
        ))}
    </nav>
  );
};
