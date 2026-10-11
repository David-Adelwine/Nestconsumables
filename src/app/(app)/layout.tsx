import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (typeof claimsData?.claims?.sub !== "string") {
    redirect("/login");
  }

  const user = await getUserContext();

  if (!user?.hasApplicationAccess) {
    redirect("/request-access");
  }

  return <AppShell>{children}</AppShell>;
}