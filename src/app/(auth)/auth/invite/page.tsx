type InvitePageProps = {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
  }>;
};

export default async function InvitePage({
  searchParams,
}: InvitePageProps) {
  const { token_hash: tokenHash, type } = await searchParams;

  const continueUrl =
    tokenHash && type === "invite"
      ? `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=invite&next=%2Fset-password`
      : "/request-access";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-semibold text-slate-900">
          Accept your invitation
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          Continue to verify your invitation and set your password.
        </p>

        <a
          href={continueUrl}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800"
        >
          Continue
        </a>
      </section>
    </main>
  );
}