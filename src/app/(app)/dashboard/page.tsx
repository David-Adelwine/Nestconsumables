import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";

type DashboardPageProps = {
  searchParams: Promise<{
    country?: string | string[];
  }>;
};

const dashboards = [
  {
    title: "Finance",
    description: "Review procurement costs and planned spend.",
    href: "/finance/dashboard",
    code: "FIN",
  },
  {
    title: "Nest Lead",
    description: "View nest operations and team access.",
    href: "/lead/dashboard",
    code: "OPS",
  },
  {
    title: "Procurement",
    description: "Manage procurement and stock plans.",
    href: "/procurement",
    code: "BUY",
  },
  {
    title: "Quartermaster",
    description: "View quartermaster inventory tools.",
    href: "/quartermaster/dashboard",
    code: "INV",
  },
];

const countryNames: Record<string, string> = {
  GH: "Ghana",
  RW: "Rwanda",
  NG: "Nigeria",
  CI: "Côte d’Ivoire",
  KE: "Kenya",
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getUserContext();
  const isAdmin = hasRole(user, "it_admin");

  let countries: string[] = [];
  let countryLoadError = "";

  if (isAdmin) {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("company_nests")
      .select("country")
      .eq("is_production_nest", true)
      .not("country", "is", null);

    if (error) {
      console.error("Failed to load dashboard countries:", error);
      countryLoadError = "Unable to load countries. Please refresh the page.";
    } else {
      countries = [
        ...new Set(
          (data ?? [])
            .map((row) => row.country?.trim().toUpperCase())
            .filter((country): country is string => Boolean(country)),
        ),
      ].sort();
    }
  }

  const params = await searchParams;
  const requestedCountry = Array.isArray(params.country)
    ? params.country[0]
    : params.country;

  const normalizedCountry = requestedCountry?.trim().toUpperCase() ?? "";
  const selectedCountry = countries.includes(normalizedCountry)
    ? normalizedCountry
    : "";

  const countryLabel = selectedCountry
    ? countryNames[selectedCountry] ?? selectedCountry
    : "";

  const dashboardLinks = dashboards.map((dashboard) => ({
    ...dashboard,
    href:
      isAdmin && selectedCountry
        ? `${dashboard.href}?country=${encodeURIComponent(selectedCountry)}`
        : dashboard.href,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-br from-white via-white to-violet-50 px-6 py-8 shadow-sm sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-800 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-violet-600" />
            Workspace
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Choose a dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Open the tools for your work area. Each dashboard brings together
            the information and actions relevant to your role.
          </p>

          {isAdmin && selectedCountry && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white/80 px-3.5 py-2.5 text-sm font-medium text-violet-950 shadow-sm">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-4 w-4 text-violet-700"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM8.25 10a1.75 1.75 0 1 1 3.5 0 1.75 1.75 0 0 1-3.5 0Zm6.49-4.59a6.73 6.73 0 0 1 1.75 3.84h-3.16a5.15 5.15 0 0 0-.79-2.05l2.2-1.79Zm-1.19-1.1-2.2 1.79a5.1 5.1 0 0 0-1.1-.42V3.22a6.73 6.73 0 0 1 3.3 1.09ZM8.25 3.22v2.46c-.4.1-.77.24-1.1.42l-2.2-1.79a6.73 6.73 0 0 1 3.3-1.09Zm-4.49 2.2 2.2 1.78a5.15 5.15 0 0 0-.79 2.05H2.01a6.73 6.73 0 0 1 1.75-3.84ZM2.01 11.5h3.16c.13.76.4 1.46.79 2.05l-2.2 1.79a6.73 6.73 0 0 1-1.75-3.84Zm2.94 4.94 2.2-1.79c.33.18.7.32 1.1.42v2.46a6.73 6.73 0 0 1-3.3-1.09Zm4.8 1.09v-2.46c.4-.1.77-.24 1.1-.42l2.2 1.79a6.73 6.73 0 0 1-3.3 1.09Zm4.49-2.19-2.2-1.79c.39-.59.66-1.29.79-2.05h3.16a6.73 6.73 0 0 1-1.75 3.84Z"
                  clipRule="evenodd"
                />
              </svg>
              Showing dashboards for {countryLabel}
            </div>
          )}
        </div>
      </section>

      {isAdmin && (
        <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-800 ring-1 ring-violet-100">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6.75h18M6.75 3v3.75M17.25 3v3.75M5.25 4.5h13.5A1.5 1.5 0 0 1 20.25 6v13.5a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5ZM7.5 11.25h3m-3 3.75h9"
                  />
                </svg>
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                  IT administrator
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Select a country
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Choose a country to open its dashboards and production nests.
                </p>
              </div>
            </div>

            <form
              action="/dashboard"
              method="get"
              className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="w-full sm:max-w-sm">
                <label
                  htmlFor="country"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Country
                </label>
                <select
                  id="country"
                  name="country"
                  defaultValue={selectedCountry}
                  required
                  className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
                >
                  <option value="" disabled>
                    Select a country
                  </option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {countryNames[country] ?? country}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={Boolean(countryLoadError) || countries.length === 0}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-700/20 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                Show dashboards
                <span aria-hidden="true" className="ml-2">→</span>
              </button>
            </form>

            {countryLoadError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {countryLoadError}
              </p>
            )}

            {!countryLoadError && countries.length === 0 && (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No production countries were found.
              </p>
            )}
          </section>

          <section className="flex flex-col justify-between rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 shadow-sm sm:p-7">
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-violet-800 shadow-sm ring-1 ring-violet-100">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                  />
                </svg>
              </span>

              <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                User administration
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Access management
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review pending account requests and grant approved users
                access.
              </p>
            </div>

            <Link
              href="/admin/access-requests"
              className="mt-6 inline-flex min-h-12 w-fit items-center justify-center rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-700/20"
            >
              Review access requests
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </section>
        </div>
      )}

      {(!isAdmin || selectedCountry) && (
        <section aria-label="Available dashboards" className="mt-9">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                Workspace tools
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                Operational dashboards
              </h2>
            </div>
            {isAdmin && selectedCountry && (
              <p className="text-sm text-slate-500">
                Country scope:{" "}
                <span className="font-semibold text-slate-700">
                  {countryLabel}
                </span>
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {dashboardLinks.map((dashboard) => (
              <Link
                key={dashboard.href}
                href={dashboard.href}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-950/5 focus:outline-none focus:ring-4 focus:ring-violet-600/15 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-xs font-extrabold tracking-wide text-violet-800 ring-1 ring-violet-100 transition group-hover:bg-violet-800 group-hover:text-white">
                    {dashboard.code}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition group-hover:border-violet-200 group-hover:text-violet-800"
                  >
                    ↗
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold text-slate-950">
                  {dashboard.title}
                </h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                  {dashboard.description}
                </p>

                <span className="mt-4 inline-flex items-center text-sm font-bold text-violet-800">
                  Open dashboard
                  <span
                    aria-hidden="true"
                    className="ml-2 transition group-hover:translate-x-1"
                  >
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAdmin &&
        !selectedCountry &&
        !countryLoadError &&
        countries.length > 0 && (
          <p className="mt-5 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-950">
            Select a country above to see its operational dashboards.
          </p>
        )}
    </main>
  );
}