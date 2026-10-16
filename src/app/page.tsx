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

const inputClassName =
  "mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const features = [
  {
    number: "01",
    title: "Inventory by nest",
    description:
      "See available stock and movement for the production nests assigned to your account.",
  },
  {
    number: "02",
    title: "Planning and cost visibility",
    description:
      "Coordinate stock plans with procurement and give finance a clear view of expected costs.",
  },
  {
    number: "03",
    title: "Access by role",
    description:
      "Permissions are assigned by authorized managers for your role, country, nest, and team.",
  },
  {
    number: "04",
    title: "Connected nest data",
    description:
      "Production nest records stay connected to the inventory workspace.",
  },
];

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

      const result = (await response.json()) as { error?: string };

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
    <main className="min-h-screen bg-[#f4f7f6] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,125,87,0.09),transparent_38%),radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.04),transparent_35%)]" />

      <header className="relative border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="group flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-800 text-lg font-bold text-white shadow-lg shadow-emerald-900/15 transition group-hover:bg-emerald-900">
              N
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-slate-950">
                Nest Consumables
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Inventory &amp; procurement
              </span>
            </span>
          </Link>

          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-emerald-600/10"
          >
            Sign in <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-start gap-8 px-5 py-9 sm:px-8 sm:py-14 lg:grid-cols-[1fr_0.88fr] lg:gap-12 lg:py-16">
        <div className="lg:sticky lg:top-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Operations workspace
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
            Keep every nest supplied and every team in sync.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Plan stock, coordinate purchasing, and track inventory across your
            production network with one clear operational view.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#request-access"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 focus:outline-none focus:ring-4 focus:ring-emerald-700/20"
            >
              Request workspace access{" "}
              <span aria-hidden="true" className="ml-2">→</span>
            </a>
            <span className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-600">
              Managed access for operations teams
            </span>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <article
                key={feature.number}
                className="group rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
                    {feature.number}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-emerald-700 opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100"
                  >
                    ↗
                  </span>
                </div>
                <h2 className="mt-4 text-sm font-bold text-slate-900">
                  {feature.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>

          <p className="mt-7 flex items-center gap-2 text-xs font-medium text-slate-500">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-4 w-4 text-emerald-700"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 1.75a.75.75 0 0 1 .32.072l6 2.75a.75.75 0 0 1 .438.683v4.16c0 3.91-2.296 6.915-6.41 8.76a.75.75 0 0 1-.616 0c-4.114-1.845-6.41-4.85-6.41-8.76v-4.16a.75.75 0 0 1 .438-.683l6-2.75A.75.75 0 0 1 10 1.75Zm3.03 6.72a.75.75 0 0 0-1.06-1.06L9 10.38 8.03 9.41a.75.75 0 0 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.06 0l3.5-3.5Z"
                clipRule="evenodd"
              />
            </svg>
            Access requests are reviewed by an authorized manager.
          </p>
        </div>

        <section
          id="request-access"
          className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.28)]"
        >
          <div className="border-b border-emerald-900/10 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800 px-6 py-6 text-white sm:px-8 sm:py-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-emerald-100">
                  Get started
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-[1.75rem]">
                  Request access
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-emerald-50/90">
                  Tell us about your role and the workspace access you need.
                </p>
              </div>
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 sm:flex">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75M14 5a4 4 0 0 1 0 8M10 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                  />
                </svg>
              </span>
            </div>

            <div className="mt-5 flex items-center gap-2 text-xs font-medium text-emerald-50/90">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-emerald-900">
                1
              </span>
              <span>Request</span>
              <span className="h-px w-8 bg-white/30" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40 text-[11px]">
                2
              </span>
              <span>Manager review</span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {loadError && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
              >
                {loadError}
              </p>
            )}

            {loadingNests ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 text-center">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-700/20 border-t-emerald-700" />
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  Loading available countries and nests
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  This should only take a moment.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-800">
                    Full name <span className="text-red-600">*</span>
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      value={requesterName}
                      onChange={(event) =>
                        setRequesterName(event.target.value)
                      }
                      className={inputClassName}
                      placeholder="e.g. Ama Mensah"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">
                    Work email <span className="text-red-600">*</span>
                    <input
                      required
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      value={requesterEmail}
                      onChange={(event) =>
                        setRequesterEmail(event.target.value)
                      }
                      className={inputClassName}
                      placeholder="you@flyzipline.com"
                    />
                  </label>
                </div>

                <label className="block text-sm font-semibold text-slate-800">
                  Requested role <span className="text-red-600">*</span>
                  <select
                    required
                    value={requestedRole}
                    onChange={(event) => {
                      setRequestedRole(event.target.value as RequestedRole);
                      setMessage("");
                    }}
                    className={inputClassName}
                  >
                    <option value="procurement">Procurement</option>
                    <option value="nest_lead">Nest Lead</option>
                    <option value="quartermaster">Quartermaster</option>
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-800">
                    Country <span className="text-red-600">*</span>
                    <select
                      required
                      value={requestedCountry}
                      onChange={(event) =>
                        handleCountryChange(event.target.value)
                      }
                      className={inputClassName}
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
                    <label className="block text-sm font-semibold text-slate-800">
                      Nest <span className="text-red-600">*</span>
                      <select
                        required
                        value={requestedNestId}
                        onChange={(event) =>
                          setRequestedNestId(event.target.value)
                        }
                        className={inputClassName}
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
                    <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                      Team <span className="text-red-600">*</span>
                      <select
                        required
                        value={requestedTeam}
                        onChange={(event) =>
                          setRequestedTeam(
                            event.target.value as RequestedTeam,
                          )
                        }
                        className={inputClassName}
                      >
                        <option value="flight">Flight</option>
                        <option value="fulfilment">Fulfilment</option>
                        <option value="facilities">Facilities</option>
                      </select>
                    </label>
                  )}
                </div>

                <label className="block text-sm font-semibold text-slate-800">
                  Why do you need access?{" "}
                  <span className="text-red-600">*</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={4}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className={`${inputClassName} min-h-32 resize-y leading-6`}
                    placeholder="Briefly describe your responsibilities and how you will use the workspace."
                  />
                  <span className="mt-1.5 block text-xs font-normal text-slate-500">
                    Please include at least 10 characters.
                  </span>
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
                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                      isSuccess
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting || nests.length === 0 || Boolean(loadError)
                  }
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 focus:outline-none focus:ring-4 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Submitting request…
                    </>
                  ) : (
                    <>
                      Submit access request{" "}
                      <span aria-hidden="true" className="ml-2">→</span>
                    </>
                  )}
                </button>
                <p className="text-center text-xs leading-5 text-slate-500">
                  Your details will be shared with an authorized manager for
                  review.
                </p>
              </form>
            )}
          </div>
        </section>
      </section>

      <footer className="relative border-t border-slate-200/80 bg-white/70 px-5 py-5 text-center text-xs font-medium text-slate-500 sm:px-8">
        Nest Consumables Management{" "}
        <span className="mx-2 text-slate-300">•</span> Inventory and procurement
        workspace
      </footer>
    </main>
  );
}