import { redirect } from "next/navigation";
import { createStoreAction } from "@/app/actions/store";
import { StoreProfileForm } from "@/components/store/store-profile-form";
import { getSessionContext } from "@/lib/auth";

export default async function SetupPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }
  if (context.activeStore) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <section className="surface w-full p-6 sm:p-8">
        <h1 className="mb-1 text-2xl font-bold">Create your first store</h1>
        <p className="mb-6 text-sm text-white/70">
          This store becomes your active workspace. You can add more stores later.
        </p>
        <StoreProfileForm submitAction={createStoreAction} submitLabel="Create store" />
      </section>
    </main>
  );
}
