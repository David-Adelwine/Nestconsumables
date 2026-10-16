"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      setHasSession(!error && Boolean(data.user));
      setIsCheckingSession(false);
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!hasSession) {
      setErrorMessage(
        "This password link is no longer valid. Ask your administrator to send a new one.",
      );
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?password_updated=1");
    router.refresh();
  }

  if (isCheckingSession) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5fb] px-4 py-10 text-slate-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(109,40,217,0.12),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.05),transparent_38%)]" />

        <section
          aria-live="polite"
          className="relative flex w-full max-w-md flex-col items-center rounded-[1.75rem] border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_24px_80px_-36px_rgba(15,23,42,0.3)]"
        >
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-700/20 border-t-violet-700" />
          <h1 className="mt-5 text-lg font-bold text-slate-900">
            Checking your password link
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please wait while we verify your session.
          </p>
        </section>
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5fb] px-4 py-10 text-slate-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(109,40,217,0.12),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.05),transparent_38%)]" />

        <section className="relative w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-800 text-lg font-bold text-white shadow-lg shadow-violet-900/15">
                N
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold tracking-tight text-slate-950">
                  Nest Consumables
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Inventory &amp; procurement
                </span>
              </span>
            </Link>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.3)]">
            <div className="bg-gradient-to-br from-violet-900 via-violet-800 to-purple-800 px-7 py-7 text-white sm:px-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm6 5v3"
                  />
                </svg>
              </div>

              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-100">
                Account security
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Password link unavailable
              </h1>
              <p className="mt-2 text-sm leading-6 text-violet-50/90">
                This password setup link can no longer be used.
              </p>
            </div>

            <div className="space-y-5 p-7 sm:p-8">
              <p className="text-sm leading-6 text-slate-600">
                This link may have expired or already been used. Ask your
                administrator to send you a new one.
              </p>

              <Link
                href="/login"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-lg shadow-violet-900/15 transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-700/20"
              >
                Go to sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5fb] px-4 py-10 text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(109,40,217,0.12),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.05),transparent_38%)]" />

      <section className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-800 text-lg font-bold text-white shadow-lg shadow-violet-900/15">
              N
            </span>
            <span className="text-left">
              <span className="block text-sm font-bold tracking-tight text-slate-950">
                Nest Consumables
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Inventory &amp; procurement
              </span>
            </span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.3)]">
          <div className="bg-gradient-to-br from-violet-900 via-violet-800 to-purple-800 px-7 py-7 text-white sm:px-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm6 5v3"
                />
              </svg>
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-100">
              Account security
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Create your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-violet-50/90">
              Choose a secure password to use when signing in.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-7 sm:p-8">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage("");
                }}
                placeholder="At least 8 characters"
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Use at least 8 characters.
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setErrorMessage("");
                }}
                placeholder="Enter the password again"
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
              />
            </label>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-lg shadow-violet-900/15 transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-700/20 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Saving password…
                </>
              ) : (
                "Save password"
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Nest Consumables Management
        </p>
      </section>
    </main>
  );
}