import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionContext } from "@/lib/auth";

export default async function LoginPage() {
  const context = await getSessionContext();
  if (context) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="surface w-full max-w-md p-6 sm:p-8">
        <h1 className="mb-1 text-2xl font-bold">Nightly Closing</h1>
        <p className="mb-6 text-sm text-white/70">
          Sign in to your store workspace. Admins can invite staff after setup.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
