import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const allowedTypes: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const next = url.searchParams.get("next");
  const destination =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/set-password";

  const supabase = await createClient();
  let callbackError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    callbackError = error?.message ?? null;
  } else if (
    tokenHash &&
    type &&
    allowedTypes.includes(type as EmailOtpType)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    callbackError = error?.message ?? null;
  } else {
    callbackError = "The email link is missing valid confirmation details.";
  }

  if (callbackError) {
    console.error("Auth confirmation failed:", callbackError);
    return NextResponse.redirect(
      new URL("/login?error=confirmation_failed", url.origin),
    );
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}