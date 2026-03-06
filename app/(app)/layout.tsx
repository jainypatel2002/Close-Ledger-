import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireSessionContext } from "@/lib/auth";
import { ReactNode } from "react";

export default async function ProtectedLayout({
  children
}: {
  children: ReactNode;
}) {
  const context = await requireSessionContext();

  if (!context.activeStore) {
    redirect("/setup");
  }

  return <AppShell context={context}>{children}</AppShell>;
}
