"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ReactNode } from "react";
import { SyncStatusProvider } from "@/components/sync/sync-status-provider";

export const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <SyncStatusProvider>{children}</SyncStatusProvider>
    <Toaster richColors closeButton position="top-right" />
  </ThemeProvider>
);
