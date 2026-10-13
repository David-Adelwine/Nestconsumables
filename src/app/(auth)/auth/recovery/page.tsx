"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PasswordRecoveryPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();

    const timeoutId = window.setTimeout(() => {
      setErrorMessage(
        "This password reset link is invalid or expired. Request a new one.",
      );
    }, 15000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        window.clearTimeout(timeoutId);
        router.replace("/set-password");
        router.refresh();
      }
    });

    return () => {
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-semibold text-slate-900">
          Verifying password reset
        </h1>

        {errorMessage ? (
          <>
            <p role="alert" className="text-sm text-red-600">
              {errorMessage}
            </p>
            <a
              href="/forgot-password"
              className="inline-block font-medium text-emerald-700 hover:text-emerald-800"
            >
              Request a new password link
            </a>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Please wait while we verify your link…
          </p>
        )}
      </div>
    </main>
  );
}