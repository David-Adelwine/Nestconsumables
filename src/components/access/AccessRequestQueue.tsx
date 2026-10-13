"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewDecision = "approved" | "declined";

type AccessRequest = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  role: string;
  country: string | null;
  nestId: string | null;
  team: string | null;
  reason: string;
  createdAt: string;
};

type QueueResponse = {
  pendingAccessRequests?: AccessRequest[];
  error?: string;
};

type ReviewResponse = {
  error?: string;
  notificationSent?: boolean;
  notificationError?: string;
};

type Props = {
  title?: string;
  description?: string;
};

function formatSubmittedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRole(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AccessRequestQueue({
  title = "Pending access requests",
  description = "Review requests within your assigned access scope.",
}: Props) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewWarning, setReviewWarning] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/access-requests/review", {
        cache: "no-store",
      });
      const result = (await response.json()) as QueueResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load access requests.");
      }

      setRequests(result.pendingAccessRequests ?? []);
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

  async function handleReview(id: string, decision: ReviewDecision) {
    setReviewingId(id);
    setReviewError("");
    setReviewMessage("");
    setReviewWarning("");

    try {
      const response = await fetch("/api/access-requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, decision }),
      });
      const result = (await response.json()) as ReviewResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "Could not review this request.");
      }

      setReviewMessage(
        decision === "approved"
          ? "Access request approved and access was granted."
          : "Access request declined.",
      );

      if (result.notificationSent === false) {
        setReviewWarning(
          result.notificationError ??
            "The decision was saved, but the notification email could not be sent.",
        );
      }

      await loadRequests();
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "Could not review this request.",
      );
    } finally {
      setReviewingId("");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Access management
          </p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>

        <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
          {requests.length} pending
        </span>
      </div>

      {loadError && (
        <p
          role="alert"
          className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800"
        >
          {loadError}
        </p>
      )}

      {reviewError && (
        <p
          role="alert"
          className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800"
        >
          {reviewError}
        </p>
      )}

      {reviewMessage && (
        <p
          role="status"
          className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800"
        >
          {reviewMessage}
        </p>
      )}

      {reviewWarning && (
        <p
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"
        >
          {reviewWarning}
        </p>
      )}

      {loading ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          Loading access requests…
        </p>
      ) : requests.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No pending requests are available for your access scope.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {requests.map((request) => {
            const isReviewing = reviewingId === request.id;

            return (
              <li key={request.id} className="p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {request.requesterName || "Name not provided"}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {formatRole(request.role)}
                      </span>
                      {request.team && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium capitalize text-violet-700">
                          {request.team}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      {request.requesterEmail}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      {request.country ? `Country: ${request.country}` : ""}
                      {request.country && request.nestId ? " · " : ""}
                      {request.nestId ? `Nest ID: ${request.nestId}` : ""}
                    </p>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {request.reason}
                    </p>

                    <p className="mt-3 text-xs text-slate-400">
                      Submitted {formatSubmittedAt(request.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={Boolean(reviewingId)}
                      onClick={() =>
                        void handleReview(request.id, "declined")
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isReviewing ? "Saving…" : "Decline"}
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(reviewingId)}
                      onClick={() =>
                        void handleReview(request.id, "approved")
                      }
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isReviewing ? "Saving…" : "Approve"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}