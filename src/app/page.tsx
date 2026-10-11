"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type NestOption = {
  id: string;
  code: string;
  name: string;
  country: string | null;
};

type RequestedRole = "procurement" | "nest_lead" | "quartermaster";
type RequestedTeam = "flight" | "fulfilment" | "facilities";

export default function Home() {
  const [nests, setNests] = useState<NestOption[]>([]);
  const [loadingNests, setLoadingNests] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requestedRole, setRequestedRole] =
    useState<RequestedRole>("procurement");
  const [requestedCountry, setRequestedCountry] = useState("");
  const [requestedNestId, setRequestedNestId] = useState("");
  const [requestedTeam, setRequestedTeam] =
    useState<RequestedTeam>("flight");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function loadNests() {
      try {
        const response = await fetch("/api/access-requests", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          nests?: NestOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Could not load the nest list.");
        }

        const availableNests = result.nests ?? [];
        setNests(availableNests);

        const firstCountry = availableNests.find(
          (nest) => nest.country,
        )?.country;

        if (firstCountry) {
          setRequestedCountry(firstCountry);
          const firstNest = availableNests.find(
            (nest) => nest.country === firstCountry,
          );
          setRequestedNestId(firstNest?.id ?? "");
        }
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load the nest list.",
        );
      } finally {
        setLoadingNests(false);
      }
    }

    void loadNests();
  }, []);

  const countries = useMemo(
    () =>
      Array.from(
        new Set(
          nests
            .map((nest) => nest.country)
            .filter((country): country is string => Boolean(country)),
        ),
      ),
    [nests],
  );

  const countryNests = nests.filter(
    (nest) => nest.country === requestedCountry,
  );

  function handleCountryChange(country: string) {
    setRequestedCountry(country);

    const firstNest = nests.find((nest) => nest.country === country);
    setRequestedNestId(firstNest?.id ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setIsSuccess(false);

    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName,
          requesterEmail,
          requestedRole,
          requestedCountry,
          requestedNestId:
            requestedRole === "procurement" ? null : requestedNestId,
          requestedTeam:
            requestedRole === "quartermaster" ? requestedTeam : null,
          reason,
          website,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not submit your request.");
      }

      setIsSuccess(true);
      setMessage(
        "Your request was submitted. An authorized manager will review it.",
      );
      setRequesterName("");
      setRequesterEmail("");
      setReason("");
      setWebsite("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit your request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">
              N
            </span>
            <span>
              <span className="block font-bold">Nest Consumables</span>
              <span className="block text-xs text-slate-500">
                Inventory and procurement
              </span>
            </span>
          </Link>

          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Operations workspace
          </p>

          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Manage consumables, stock plans, and procurement in one place.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Nest Consumables helps operations teams track inventory by nest,
            prepare recurring stock plans, and give procurement and finance
            teams a shared view of planned purchasing.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Inventory by nest</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review stock for the production nests your account is assigned
                to.
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Planning and cost visibility</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Build stock plans and give procurement and finance a shared
                view of expected costs.
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Role based access</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Access is assigned by authorized managers according to role,
                country, nest, and team.
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Connected nest data</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Production nest records are synchronized into the application.
              </p>
            </article>
          </div>
        </div>

        <section
          id="request-access"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Get started
          </p>
          <h2 className="mt-2 text-2xl font-bold">Request access</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Submit your work details and the access you need. An authorized
            manager will review your request.
          </p>

          {loadError && (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {loadingNests ? (
            <p className="mt-6 text-sm text-slate-500">
              Loading countries and nests…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={requesterName}
                  onChange={(event) => setRequesterName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Work email
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={requesterEmail}
                  onChange={(event) => setRequesterEmail(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Requested role
                <select
                  value={requestedRole}
                  onChange={(event) => {
                    setRequestedRole(event.target.value as RequestedRole);
                    setMessage("");
                  }}
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                >
                  <option value="procurement">Procurement</option>
                  <option value="nest_lead">Nest Lead</option>
                  <option value="quartermaster">Quartermaster</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Country
                <select
                  required
                  value={requestedCountry}
                  onChange={(event) => handleCountryChange(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                >
                  <option value="">Select a country</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>

              {requestedRole !== "procurement" && (
                <label className="block text-sm font-medium text-slate-700">
                  Nest
                  <select
                    required
                    value={requestedNestId}
                    onChange={(event) => setRequestedNestId(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                  >
                    <option value="">Select a nest</option>
                    {countryNests.map((nest) => (
                      <option key={nest.id} value={nest.id}>
                        {nest.code} — {nest.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {requestedRole === "quartermaster" && (
                <label className="block text-sm font-medium text-slate-700">
                  Team
                  <select
                    value={requestedTeam}
                    onChange={(event) =>
                      setRequestedTeam(event.target.value as RequestedTeam)
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                  >
                    <option value="flight">Flight</option>
                    <option value="fulfilment">Fulfilment</option>
                    <option value="facilities">Facilities</option>
                  </select>
                </label>
              )}

              <label className="block text-sm font-medium text-slate-700">
                Why do you need access?
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Briefly describe your responsibilities."
                />
              </label>

              <label
                aria-hidden="true"
                className="absolute -left-[10000px] h-px w-px overflow-hidden"
              >
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </label>

              {message && (
                <p
                  role={isSuccess ? "status" : "alert"}
                  className={`text-sm ${
                    isSuccess ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || nests.length === 0 || Boolean(loadError)}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit access request"}
              </button>
            </form>
          )}
        </section>
      </section>

      <footer className="border-t border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-500">
        Nest Consumables Management
      </footer>
    </main>
  );
}