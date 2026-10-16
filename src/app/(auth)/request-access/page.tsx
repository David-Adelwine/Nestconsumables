"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type RequestedRole = "" | "nestLead" | "quarterMaster" | "procurement";

const nests = [
  { code: "GH-1", name: "Walewale" },
  { code: "GH-2", name: "Kintampo" },
  { code: "GH-3", name: "Walewale Distribution Centre" },
];

const roleLabels: Record<Exclude<RequestedRole, "">, string> = {
  nestLead: "Nest Lead",
  quarterMaster: "Quartermaster",
  procurement: "Procurement",
};

export default function RequestAccessPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("");
  const [nestCode, setNestCode] = useState("");
  const [reason, setReason] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestReference, setRequestReference] = useState("");

  const needsNest =
    requestedRole === "nestLead" || requestedRole === "quarterMaster";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim() || !email.trim() || !requestedRole || !reason.trim()) {
      return;
    }

    if (needsNest && !nestCode) {
      return;
    }

    setRequestReference(`ACCESS-${String(Date.now()).slice(-6)}`);
    setRequestSubmitted(true);
  }

  function startAnotherRequest() {
    setRequestSubmitted(false);
    setRequestReference("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-xl font-extrabold text-white">
              N
            </div>
            <div>
              <p className="font-bold leading-tight">Nest Consumables</p>
              <p className="mt-1 text-xs text-slate-500">
                Inventory and procurement workspace
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:inline-flex">
            Secure workspace access
          </span>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 p-7 text-white shadow-xl shadow-emerald-950/15 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
              Account access
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Access needs to be assigned
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-6 text-emerald-50/90">
              Your account is recognized, but it doesn’t have an application
              role yet. Request access from the IT Admin so they can review
              which parts of the workspace you need.
            </p>

            <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-800">
                  !
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-amber-950">
                    You don’t have access yet
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    Submitting a request will not activate your account
                    immediately. An IT Admin must review and assign your role.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-white/20 pt-6">
              <h2 className="text-sm font-bold text-white">
                What happens next?
              </h2>

              <ol className="mt-4 space-y-4">
                <NextStep number="1" title="Submit your request">
                  Provide your work details and the access you need.
                </NextStep>
                <NextStep number="2" title="IT Admin reviews it">
                  The IT Admin checks your requested role and nest.
                </NextStep>
                <NextStep number="3" title="Access is assigned">
                  You can use the application after your role is approved.
                </NextStep>
              </ol>
            </div>

            <Link
              href="/login"
              className="mt-7 inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              ← Return to sign in
            </Link>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
            {requestSubmitted ? (
              <div className="py-2 sm:py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-800">
                  ✓
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                  Request recorded
                </p>

                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  Your access request is ready for review
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  The request preview has been submitted for the IT Admin to
                  review. Your access remains inactive until a role is assigned.
                </p>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-inner">
                  <p className="text-xs text-slate-500">Request reference</p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {requestReference}
                  </p>

                  <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                    <RequestDetail label="Requested role">
                      {requestedRole ? roleLabels[requestedRole] : ""}
                    </RequestDetail>

                    {needsNest && (
                      <RequestDetail label="Requested nest">
                        {nestCode}
                      </RequestDetail>
                    )}
                  </div>

                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                    This is a UI preview. The request has not been sent to an
                    IT Admin yet.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startAnotherRequest}
                  className="mt-6 min-h-12 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                >
                  Back to request form
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6 border-b border-slate-100 pb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                    Access request
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                    Request application access
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Give the IT Admin the details needed to review your request.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <FormField
                    label="Full name"
                    required
                    value={fullName}
                    onChange={setFullName}
                    placeholder="Enter your name"
                    autoComplete="name"
                  />

                  <FormField
                    label="Work email"
                    required
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Access role requested{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <select
                      required
                      value={requestedRole}
                      onChange={(event) => {
                        setRequestedRole(
                          event.target.value as RequestedRole,
                        );
                        setNestCode("");
                      }}
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    >
                      <option value="">Choose a role</option>
                      <option value="nestLead">Nest Lead</option>
                      <option value="quarterMaster">Quartermaster</option>
                      <option value="procurement">Procurement</option>
                    </select>
                  </label>

                  {needsNest && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                        Nest <span className="text-red-500">*</span>
                      </span>
                      <select
                        required
                        value={nestCode}
                        onChange={(event) => setNestCode(event.target.value)}
                        className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="">Choose a nest</option>
                        {nests.map((nest) => (
                          <option key={nest.code} value={nest.code}>
                            {nest.code} · {nest.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {requestedRole === "procurement" && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                      Procurement access is intended for purchasing across
                      nests. The IT Admin will confirm the appropriate access
                      scope.
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Why do you need access?{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <textarea
                      required
                      rows={4}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Briefly describe your responsibilities and the access you need."
                      className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    />
                  </label>

                  <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
                    The IT Admin will review this request before assigning
                    application access. Requesting a role does not grant that
                    role.
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-12 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                  >
                    Submit access request
                  </button>
                </form>
              </>
            )}
          </section>
        </div>

        <footer className="mt-8 border-t border-slate-200/80 pt-4 text-center text-xs text-slate-500">
          Nest Consumables · Access requests
        </footer>
      </div>
    </main>
  );
}

function NextStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
        {number}
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-emerald-100/80">{children}</p>
      </div>
    </li>
  );
}

function RequestDetail({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{children}</p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}