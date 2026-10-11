"use client";

import { useCallback, useEffect, useState } from "react";

type AccessRequest = {
  request_id: string;
  user_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requested_role: string;
  requested_country: string | null;
  requested_nest_id: number | null;
  requested_team: string | null;
  reason: string;
  status: string;
  created_at: string;
};

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/management/access-requests", {
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
    decision: "approve" | "reject",
  ) {
    setBusyRequestId(accessRequest.request_id);
    setMessage("");
    setLoadError("");

    try {
      const response = await fetch("/api/management/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: accessRequest.request_id,
          decision,
          reviewNote: reviewNotes[accessRequest.request_id] ?? "",
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        invitationSent?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not update this request.");
      }

      if (decision === "approve") {
        setMessage(
          result.invitationSent
            ? `Access granted. An invitation was sent to ${accessRequest.requester_email}.`
            : "Access granted to the existing account.",
        );
      } else {
        setMessage("The access request was rejected.");
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
            Review requests for the countries and nests you are authorized to
            manage.
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
          role="status"
          className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
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
          There are no pending requests in your assigned scope.
        </p>
      ) : (
        <div className="mt-7 space-y-5">
          {requests.map((accessRequest) => {
            const isBusy = busyRequestId === accessRequest.request_id;

            return (
              <article
                key={accessRequest.request_id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {accessRequest.requester_name || "Name not provided"}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {accessRequest.requester_email || "Email not provided"}
                    </p>
                  </div>

                  <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    {formatRole(accessRequest.requested_role)}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Country</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {accessRequest.requested_country || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Nest</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {accessRequest.requested_nest_id
                        ? `Nest ID ${accessRequest.requested_nest_id}`
                        : "Country-wide"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-gray-500">Team</dt>
                    <dd className="mt-1 font-medium capitalize text-gray-900">
                      {accessRequest.requested_team || "—"}
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
                  Submitted{" "}
                  {new Date(accessRequest.created_at).toLocaleString()}
                </p>

                <label className="mt-5 block text-sm font-medium text-gray-700">
                  Review note (optional)
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reviewNotes[accessRequest.request_id] ?? ""}
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [accessRequest.request_id]: event.target.value,
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
                    onClick={() => void reviewRequest(accessRequest, "reject")}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {isBusy ? "Saving…" : "Reject"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void reviewRequest(accessRequest, "approve")}
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