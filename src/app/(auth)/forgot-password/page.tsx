"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

    if (!appUrl) {
      setErrorMessage(
        "Password reset is not configured. Please contact your administrator.",
      );
      return;
    }

    let redirectTo: URL;

    try {
      const normalizedAppUrl = appUrl.replace(/\/+$/, "");
      redirectTo = new URL(
        "/auth/confirm?next=%2Fset-password",
        `${normalizedAppUrl}/`,
      );
    } catch {
      setErrorMessage(
        "The password reset URL is not configured correctly. Please contact your administrator.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: redirectTo.toString() },
      );

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setMessage(
        "If an account exists for that email, a password reset link has been sent.",
      );
    } catch {
      setErrorMessage("Could not send the reset link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
              Set or reset your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-violet-50/90">
              Enter your work email and we’ll send you a secure password link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-7 sm:p-8">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">
                Work email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setMessage("");
                  setErrorMessage("");
                }}
                placeholder="you@company.com"
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
              />
            </label>

            {message && (
              <p
                role="status"
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900"
              >
                {message}
              </p>
            )}

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
                  Sending link…
                </>
              ) : (
                "Send password link"
              )}
            </button>

            <p className="text-center text-sm text-slate-600">
              Remember your password?{" "}
              <Link
                href="/login"
                className="font-semibold text-violet-800 underline decoration-violet-300 underline-offset-4 transition hover:text-violet-950"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          If an account exists for the email you enter, we’ll send reset
          instructions to that address.
        </p>
      </section>
    </main>
  );
}