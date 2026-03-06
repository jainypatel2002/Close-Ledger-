"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/session";

export const SignOutButton = () => {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await signOut();
          router.replace("/login");
        });
      }}
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
};
