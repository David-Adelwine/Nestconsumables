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

function getSafeDestination(next: string | null): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
  ) {
    return next;
  }

  return "/set-password";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const destination = getSafeDestination(url.searchParams.get("next"));

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

    // Keep reset failures on the password page so the user sees its
    // expired or unavailable link message instead of being sent to login.
    if (destination.startsWith("/set-password")) {
      return NextResponse.redirect(
        new URL("/set-password?reset_link=invalid", url.origin),
      );
    }

    return NextResponse.redirect(
      new URL("/login?error=confirmation_failed", url.origin),
    );
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}