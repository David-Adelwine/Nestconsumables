"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VerifyResetPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedEmail || normalizedToken.length !== 6) {
      setErrorMessage("Enter your email address and the 6-digit code.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "recovery",
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(
        "That code is invalid or expired. Request a new reset email and try its latest code.",
      );
      return;
    }

    router.replace("/set-password");
    router.refresh();
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
                  d="M4 7.5 12 13l8-5.5M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                />
              </svg>
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet-100">
              Account security
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Verify your reset code
            </h1>
            <p className="mt-2 text-sm leading-6 text-violet-50/90">
              Enter the email address you used and the latest code from your
              password reset email.
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
                  setErrorMessage("");
                }}
                placeholder="you@company.com"
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">
                6-digit code
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={6}
                value={token}
                onChange={(event) => {
                  setToken(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setErrorMessage("");
                }}
                placeholder="••••••"
                className="mt-2 block min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl font-semibold tracking-[0.45em] text-slate-950 shadow-sm outline-none transition placeholder:text-slate-300 placeholder:tracking-[0.45em] hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Use the latest code sent to your email.
              </span>
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
                  Verifying code…
                </>
              ) : (
                "Verify code"
              )}
            </button>

            <p className="text-center text-sm text-slate-600">
              Need a new code?{" "}
              <Link
                href="/forgot-password"
                className="font-semibold text-violet-800 underline decoration-violet-300 underline-offset-4 transition hover:text-violet-950"
              >
                Request another reset email
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Nest Consumables Management
        </p>
      </section>
    </main>
  );
}