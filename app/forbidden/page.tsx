import Link from "next/link";
import { DepthButton } from "@/components/ui/depth-button";

export default async function ForbiddenPage({
  searchParams
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="surface w-full max-w-lg space-y-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Access denied</h1>
        <p className="text-sm text-white/70">
          {params.reason === "admin"
            ? "This section requires an ADMIN role."
            : params.reason === "history"
              ? "History is disabled for your role in this store."
              : params.reason === "reports"
                ? "You do not have report access for this store."
            : "You do not have permission to view this page."}
        </p>
        <Link href="/dashboard">
          <DepthButton>Return to dashboard</DepthButton>
        </Link>
      </div>
    </main>
  );
}
