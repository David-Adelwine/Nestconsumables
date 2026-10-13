"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

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
      redirectTo = new URL(
        "/auth/recovery",
        `${appUrl.replace(/\/+$/, "")}/`,
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Set or reset your password
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your work email and we’ll send you a password link.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Work email
          </span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600"
          />
        </label>

        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Send password link"}
        </button>
      </form>
    </main>
  );
}