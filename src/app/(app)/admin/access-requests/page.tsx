"use client";

import { useCallback, useEffect, useState } from "react";

type AccessRequest = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  role: string;
  country: string | null;
  nestId: string;
  team: string | null;
  reason: string;
  createdAt: string;
};

type ReviewResult = {
  success?: boolean;
  decision?: "approved" | "declined";
  accountType?: "existing" | "new";
  notificationSent?: boolean;
  notificationError?: string;
  error?: string;
};

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/access-requests/review", {
        cache: "no-store",
      });

      const result = (await response.json()) as {
        requests?: AccessRequest[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load access requests.");
      }

      setRequests(result.requests ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load access requests.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function reviewRequest(
    accessRequest: AccessRequest,
    decision: "approved" | "declined",
  ) {
    setBusyRequestId(accessRequest.id);
    setMessage("");
    setMessageIsError(false);
    setLoadError("");

    try {
      const response = await fetch("/api/access-requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: accessRequest.id,
          decision,
          reviewNote: reviewNotes[accessRequest.id] ?? "",
        }),
      });

      const result = (await response.json()) as ReviewResult;

      if (!response.ok) {
        throw new Error(result.error ?? "Could not update this request.");
      }

      if (decision === "approved" && result.accountType === "existing") {
        setMessage(
          `Access approved and added to ${accessRequest.requesterEmail}'s existing account. They can sign in with their current password.`,
        );
      } else if (decision === "approved" && result.notificationSent) {
        setMessage(
          `Access approved. A password setup email was sent to ${accessRequest.requesterEmail}.`,
        );
      } else if (decision === "approved") {
        setMessage(
          result.notificationError ??
            "Access was approved, but the notification could not be sent.",
        );
        setMessageIsError(true);
      } else if (result.notificationSent) {
        setMessage(
          `The request was declined and an email was sent to ${accessRequest.requesterEmail}.`,
        );
      } else {
        setMessage(
          result.notificationError ??
            "The request was declined, but the email could not be sent. Check the Resend settings.",
        );
        setMessageIsError(true);
      }

      await loadRequests();
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not update this request.",
      );
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-br from-white via-white to-violet-50 px-6 py-8 shadow-sm sm:px-9 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-200/35 blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-violet-600" />
              Access management
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Access requests
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Review pending requests and grant access to approved users.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadRequests()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-600/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 9a6.5 6.5 0 0 0-11.2-3L3.5 8" />
              <path d="M3.5 4.5V8h3.5M3.5 11a6.5 6.5 0 0 0 11.2 3l1.8-2" />
              <path d="M16.5 15.5V12H13" />
            </svg>
            {loading ? "Refreshing…" : "Refresh requests"}
          </button>
        </div>
      </section>

      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
            messageIsError
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-violet-200 bg-violet-50 text-violet-900"
          }`}
        >
          {message}
        </p>
      )}

      {loadError && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-48 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-700/20 border-t-violet-700" />
          <p className="mt-4 text-sm font-semibold text-slate-700">
            Loading access requests
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checking for requests that need review.
          </p>
        </div>
      ) : requests.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-800 ring-1 ring-violet-100">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 4 4L19 6" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            You’re all caught up
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            There are no pending access requests.
          </p>
        </div>
      ) : (
        <section
          aria-label="Pending access requests"
          className="mt-7 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">
              Pending review
            </h2>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-900">
              {requests.length} {requests.length === 1 ? "request" : "requests"}
            </span>
          </div>

          {requests.map((accessRequest) => {
            const isBusy = busyRequestId === accessRequest.id;

            return (
              <article
                key={accessRequest.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-violet-200 hover:shadow-md"
              >
                <div className="border-b border-slate-100 bg-gradient-to-r from-white to-violet-50/70 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-950">
                          {accessRequest.requesterName || "Name not provided"}
                        </h3>
                        <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-900">
                          {formatRole(accessRequest.role)}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-sm text-slate-600">
                        {accessRequest.requesterEmail || "Email not provided"}
                      </p>
                    </div>

                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Pending
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Country
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {accessRequest.country || "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Nest
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {accessRequest.nestId
                          ? `Nest ID ${accessRequest.nestId}`
                          : "Country-wide"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Team
                      </dt>
                      <dd className="mt-1 font-semibold capitalize text-slate-900">
                        {accessRequest.team || "—"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5">
                    <h4 className="text-sm font-bold text-slate-800">
                      Reason for request
                    </h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {accessRequest.reason}
                    </p>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    Submitted {formatDate(accessRequest.createdAt)}
                  </p>

                  <label className="mt-5 block text-sm font-semibold text-slate-800">
                    Review note{" "}
                    <span className="font-normal text-slate-500">
                      (optional)
                    </span>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={reviewNotes[accessRequest.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [accessRequest.id]: event.target.value,
                        }))
                      }
                      className="mt-2 block w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/10"
                      placeholder="Add a note for the record."
                    />
                  </label>

                  <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void reviewRequest(accessRequest, "declined")
                      }
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-4 focus:ring-red-600/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Saving…" : "Decline request"}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void reviewRequest(accessRequest, "approved")
                      }
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-700/20 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isBusy ? (
                        <>
                          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          Saving…
                        </>
                      ) : (
                        "Approve and grant access"
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}