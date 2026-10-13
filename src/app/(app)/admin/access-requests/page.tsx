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

      if (decision === "approved") {
        setMessage(
          `Access approved. The password setup email was sent to ${accessRequest.requesterEmail}.`,
        );
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
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            ACCESS MANAGEMENT
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Access requests
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review pending requests and grant access to approved users.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`mt-5 rounded-lg border p-3 text-sm ${
            messageIsError
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      )}

      {loadError && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading access requests…
        </p>
      ) : requests.length === 0 ? (
        <p className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          There are no pending access requests.
        </p>
      ) : (
        <div className="mt-7 space-y-5">
          {requests.map((accessRequest) => {
            const isBusy = busyRequestId === accessRequest.id;

            return (
              <article
                key={accessRequest.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {accessRequest.requesterName || "Name not provided"}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {accessRequest.requesterEmail || "Email not provided"}
                    </p>
                  </div>

                  <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {formatRole(accessRequest.role)}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Country</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {accessRequest.country || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Nest</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {accessRequest.nestId
                        ? `Nest ID ${accessRequest.nestId}`
                        : "Country-wide"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Team</dt>
                    <dd className="mt-1 font-medium capitalize text-gray-900">
                      {accessRequest.team || "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <h3 className="text-sm font-medium text-gray-700">
                    Reason for request
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                    {accessRequest.reason}
                  </p>
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  Submitted {formatDate(accessRequest.createdAt)}
                </p>

                <label className="mt-5 block text-sm font-medium text-gray-700">
                  Review note (optional)
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reviewNotes[accessRequest.id] ?? ""}
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [accessRequest.id]: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="Add a note for the record."
                  />
                </label>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void reviewRequest(accessRequest, "declined")
                    }
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {isBusy ? "Saving…" : "Decline"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void reviewRequest(accessRequest, "approved")
                    }
                    className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {isBusy ? "Saving…" : "Approve and grant access"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}