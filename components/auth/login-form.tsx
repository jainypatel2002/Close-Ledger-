"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DepthButton } from "@/components/ui/depth-button";

export const LoginForm = () => {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email.split("@")[0] }
          }
        });
        if (signUpError) {
          throw signUpError;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) {
          throw signInError;
        }
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="field"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {mode === "signup" && (
        <div className="space-y-1">
          <label htmlFor="full_name" className="field-label">
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            className="field"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="field"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-600/20 p-2 text-sm">
          {error}
        </p>
      )}

      <DepthButton type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
      </DepthButton>

      <button
        type="button"
        className="w-full text-xs text-white/70 underline-offset-4 hover:underline"
        onClick={() => setMode((current) => (current === "login" ? "signup" : "login"))}
      >
        {mode === "login"
          ? "Need an account? Create one."
          : "Already have an account? Sign in."}
      </button>
    </form>
  );
};
