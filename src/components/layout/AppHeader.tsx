"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const pageTitles: Record<string, string> = {
  "/dashboard": "Choose a dashboard",
  "/finance/dashboard": "Finance",
  "/lead/dashboard": "Nest Lead",
  "/procurement": "Procurement",
  "/quartermaster/dashboard": "Quartermaster",
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const pageTitle =
    pageTitles[pathname] ??
    (pathname.startsWith("/procurement/") ? "Procurement" : "Workspace");

  async function handleSignOut() {
    setErrorMessage("");
    setIsSigningOut(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      setErrorMessage("Could not sign out. Please try again.");
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 text-gray-400">Workspace</span>
        <span className="text-gray-300" aria-hidden="true">
          /
        </span>
        <span className="truncate font-medium text-gray-800">{pageTitle}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {errorMessage && (
          <span role="alert" className="hidden text-sm text-red-600 sm:inline">
            {errorMessage}
          </span>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}