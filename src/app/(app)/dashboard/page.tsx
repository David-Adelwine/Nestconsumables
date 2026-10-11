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
  },
  {
    title: "Nest Lead",
    description: "View nest operations and team access.",
    href: "/lead/dashboard",
  },
  {
    title: "Procurement",
    description: "Manage procurement and stock plans.",
    href: "/procurement",
  },
  {
    title: "Quartermaster",
    description: "View quartermaster inventory tools.",
    href: "/quartermaster/dashboard",
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
    <div className="mx-auto w-full max-w-6xl">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
          WORKSPACE
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          Choose a dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Select a dashboard to open it.
        </p>
      </div>

      {isAdmin && (
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Select a country
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Choose a country to open its dashboards and production nests.
          </p>

          <form
            action="/dashboard"
            method="get"
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="w-full sm:max-w-sm">
              <label
                htmlFor="country"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Country
              </label>
              <select
                id="country"
                name="country"
                defaultValue={selectedCountry}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Show dashboards
            </button>
          </form>

          {countryLoadError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {countryLoadError}
            </p>
          )}

          {!countryLoadError && countries.length === 0 && (
            <p className="mt-3 text-sm text-gray-600">
              No production countries were found.
            </p>
          )}

          {selectedCountry && (
            <p className="mt-3 text-sm text-emerald-800">
              Showing dashboard links for {countryLabel}.
            </p>
          )}
        </section>
      )}

      {(!isAdmin || selectedCountry) && (
        <section
          aria-label="Available dashboards"
          className="mt-8 grid gap-5 sm:grid-cols-2"
        >
          {dashboardLinks.map((dashboard) => (
            <Link
              key={dashboard.href}
              href={dashboard.href}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-emerald-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                {dashboard.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {dashboard.description}
              </p>
              <span className="mt-5 inline-block text-sm font-semibold text-emerald-700">
                Open dashboard →
              </span>
            </Link>
          ))}
        </section>
      )}

      {isAdmin && !selectedCountry && !countryLoadError && countries.length > 0 && (
        <p className="mt-6 text-sm text-gray-600">
          Select a country above to see its dashboard links.
        </p>
      )}
    </div>
  );
}