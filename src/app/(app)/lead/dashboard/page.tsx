"use client";

import { useEffect, useMemo, useState } from "react";

type Team = "flight" | "fulfilment" | "facilities";
type TeamFilter = Team | "all";

type NestOption = {
  id: string;
  code: string;
  name: string;
};

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  team: Team;
  category: string | null;
  uom: string;
  stockQuantity: number | null;
  stockUnit: string | null;
  stockUpdatedAt: string | null;
};

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

type DashboardData = {
  availableNests: NestOption[];
  assignedNest: {
    id: string;
    code: string;
    name: string;
    country: string | null;
    countryName: string;
  };
  allowedTeams: Team[];
  items: CatalogItem[];
  pendingAccessRequests?: AccessRequest[];
};

const ITEMS_PER_PAGE = 40;

type ReviewDecision = "approved" | "declined";

type ReviewResponse = {
  success?: boolean;
  error?: string;
  decision?: ReviewDecision;
  notificationSent?: boolean;
  notificationError?: string;
};

const teamLabels: Record<Team, string> = {
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function teamStyle(team: Team) {
  if (team === "flight") return "bg-blue-50 text-blue-700";
  if (team === "fulfilment") return "bg-violet-50 text-violet-700";
  return "bg-amber-50 text-amber-700";
}

function teamIcon(team: Team) {
  if (team === "flight") return "↗";
  if (team === "fulfilment") return "□";
  return "⌂";
}

export default function NestLeadDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedNestId, setSelectedNestId] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewWarning, setReviewWarning] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewingRequestId, setReviewingRequestId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const query = selectedNestId
          ? `?nestId=${encodeURIComponent(selectedNestId)}`
          : "";

        const response = await fetch(`/api/lead/dashboard${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? "Unable to load Nest Lead dashboard data.",
          );
        }

        const data = result as DashboardData;
        setDashboard(data);

        if (!selectedNestId) {
          setSelectedNestId(data.assignedNest.id);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Nest Lead dashboard data.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [selectedNestId, refreshKey]);

  async function handleReview(
    requestId: string,
    decision: ReviewDecision,
  ) {
    setReviewingRequestId(requestId);
    setReviewError("");
    setReviewWarning("");
    setReviewMessage("");

    try {
      const response = await fetch("/api/access-requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });

      const result = (await response.json().catch(() => ({}))) as ReviewResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to review this request.");
      }

      if (result.notificationSent === false) {
        setReviewMessage(
          decision === "approved"
            ? "Access request approved and access was granted."
            : "Access request declined.",
        );
        setReviewWarning(
          result.notificationError ??
            "The decision was saved, but the notification email could not be sent.",
        );
      } else {
        setReviewMessage(
          decision === "approved"
            ? "Access request approved. An email was sent with the password link."
            : "Access request declined. A notification email was sent.",
        );
      }

      setRefreshKey((current) => current + 1);
    } catch (reviewActionError) {
      setReviewError(
        reviewActionError instanceof Error
          ? reviewActionError.message
          : "Unable to review this request.",
      );
    } finally {
      setReviewingRequestId("");
    }
  }

  const items = dashboard?.items ?? [];
  const allowedTeams = dashboard?.allowedTeams ?? [];
  const assignedNest = dashboard?.assignedNest;
  const availableNests = dashboard?.availableNests ?? [];
  const pendingAccessRequests = dashboard?.pendingAccessRequests ?? [];

  const categoryOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.category || "Unassigned"))].sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesTeam = teamFilter === "all" || item.team === teamFilter;
      const itemCategory = item.category || "Unassigned";
      const matchesCategory =
        !categoryFilter || itemCategory === categoryFilter;

      const searchableText = [
        item.name,
        item.code,
        teamLabels[item.team],
        item.category ?? "Unassigned",
        item.uom,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesTeam &&
        matchesCategory &&
        (!query || searchableText.includes(query))
      );
    });
  }, [items, teamFilter, categoryFilter, search]);

  useEffect(() => {
    setInventoryPage(1);
  }, [selectedNestId, teamFilter, categoryFilter, search]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE),
  );
  const pageStart = (inventoryPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filteredItems.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const firstVisibleItem = filteredItems.length === 0 ? 0 : pageStart + 1;
  const lastVisibleItem = Math.min(
    pageStart + ITEMS_PER_PAGE,
    filteredItems.length,
  );

  const trackedCount = items.filter(
    (item) => item.stockQuantity !== null,
  ).length;

  const teamSummaries = allowedTeams.map((team) => {
    const teamItems = items.filter((item) => item.team === team);
    const trackedItems = teamItems.filter(
      (item) => item.stockQuantity !== null,
    );

    return {
      team,
      catalogCount: teamItems.length,
      trackedCount: trackedItems.length,
    };
  });

  const assignedTeamLabel =
    allowedTeams.length === 3
      ? "Flight · Fulfilment · Facilities"
      : allowedTeams.map((team) => teamLabels[team]).join(" · ");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-5 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-white p-6 shadow-sm sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Nest lead workspace
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Nest inventory overview
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Review the catalog and stock recorded at your assigned nest.
            </p>
          </div>

          {availableNests.length > 1 ? (
            <label className="w-full max-w-xs">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                Assigned nest
              </span>
              <select
                value={selectedNestId}
                onChange={(event) => {
                  setSelectedNestId(event.target.value);
                  setTeamFilter("all");
                  setCategoryFilter("");
                  setReviewError("");
                  setReviewWarning("");
                  setReviewMessage("");
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-100"
              >
                {availableNests.map((nest) => (
                  <option key={nest.id} value={nest.id}>
                    {nest.code} · {nest.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-slate-500">Assigned nest</span>
              <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                {assignedNest?.code ?? (loading ? "Loading…" : "—")}
              </span>
            </div>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <section className="mt-7 flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl text-emerald-700">
            ⌖
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Assigned location
            </p>
            <h2 className="mt-1 text-lg font-bold">
              {assignedNest
                ? `${assignedNest.code} · ${assignedNest.name}`
                : loading
                  ? "Loading assigned nest…"
                  : "No assigned nest"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {assignedNest?.countryName ?? ""}
            </p>
          </div>

          <div className="sm:ml-auto sm:text-right">
            <p className="text-xs text-slate-500">Teams covered</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {assignedTeamLabel || "—"}
            </p>
          </div>

          <span className="w-fit rounded border border-emerald-100 bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-emerald-800 sm:ml-3">
            LIVE SUPABASE DATA
          </span>
        </section>

        <section
          aria-label="Nest inventory summary"
          className="mt-5 grid gap-4 sm:grid-cols-3"
        >
          <SummaryCard
            label="Catalog items"
            value={loading ? "…" : items.length}
            detail="Active items available to your team access"
            icon="▤"
            iconClass="bg-emerald-50 text-emerald-700"
          />

          <SummaryCard
            label="Items tracked here"
            value={loading ? "…" : trackedCount}
            detail={`Items with a stock record at ${assignedNest?.code ?? "this nest"}`}
            icon="✓"
            iconClass="bg-blue-50 text-blue-700"
          />

          <SummaryCard
            label="Items not tracked here"
            value={loading ? "…" : items.length - trackedCount}
            detail="Each nest can track the items it needs"
            icon="—"
            iconClass="bg-amber-50 text-amber-700"
          />
        </section>

        <section
          aria-label="Access requests"
          className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md"
        >
          <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Access management
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Pending Quartermaster requests
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Requests for {assignedNest?.code ?? "the selected nest"} appear
                here for review.
              </p>
            </div>

            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
              {pendingAccessRequests.length} pending
            </span>
          </div>

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

          {loading && !dashboard ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Loading access requests…
            </div>
          ) : pendingAccessRequests.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                No pending requests for this nest.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                New Quartermaster requests will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingAccessRequests.map((accessRequest) => {
                const isReviewing =
                  reviewingRequestId === accessRequest.id;

                return (
                  <li key={accessRequest.id} className="p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">
                            {accessRequest.requesterName || "Name not provided"}
                          </h3>

                          {accessRequest.team &&
                            (
                              [
                                "flight",
                                "fulfilment",
                                "facilities",
                              ] as const
                            ).includes(accessRequest.team as Team) && (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${teamStyle(
                                  accessRequest.team as Team,
                                )}`}
                              >
                                {teamLabels[accessRequest.team as Team]}
                              </span>
                            )}
                        </div>

                        <p className="mt-1 text-sm text-slate-600">
                          {accessRequest.requesterEmail}
                        </p>

                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {accessRequest.reason}
                        </p>

                        <p className="mt-3 text-xs text-slate-400">
                          Submitted {formatUpdatedAt(accessRequest.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={Boolean(reviewingRequestId)}
                          onClick={() =>
                            void handleReview(accessRequest.id, "declined")
                          }
                          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isReviewing ? "Saving…" : "Decline"}
                        </button>

                        <button
                          type="button"
                          disabled={Boolean(reviewingRequestId)}
                          onClick={() =>
                            void handleReview(accessRequest.id, "approved")
                          }
                          className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
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

        <section className="mt-9">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                Inventory overview
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                Inventory by team
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Choose a team to review its catalog and recorded stock at this
              nest.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {teamSummaries.map(
              ({ team, catalogCount, trackedCount: teamTrackedCount }) => {
                const selected = teamFilter === team;

                return (
                  <button
                    key={team}
                    type="button"
                    onClick={() => {
                      setTeamFilter(selected ? "all" : team);
                      setCategoryFilter("");
                    }}
                    aria-pressed={selected}
                    className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      selected
                        ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-100"
                        : "border-slate-200 hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{teamLabels[team]}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {catalogCount} catalog{" "}
                          {catalogCount === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${teamStyle(
                          team,
                        )}`}
                      >
                        {teamIcon(team)}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">
                        Tracked at {assignedNest?.code ?? "nest"}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">
                        {teamTrackedCount} / {catalogCount}
                      </span>
                    </div>

                    <span className="mt-3 block text-xs font-semibold text-emerald-700">
                      {selected
                        ? "Showing this team"
                        : `View ${teamLabels[team]}`}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-lg shadow-emerald-950/5 ring-1 ring-emerald-50">
          <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-white p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                  {assignedNest?.code ?? "Assigned nest"}
                  {teamFilter !== "all" ? ` · ${teamLabels[teamFilter]}` : ""}
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                  Catalog and nest stock
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Review stock levels and catalog details for this nest. Items
                  with no stock record remain visible.
                </p>
              </div>
              <span className="w-fit rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm">
                {loading ? "Loading…" : `${filteredItems.length} items`}
              </span>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm md:grid-cols-[minmax(220px,1fr)_200px_220px]">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-500 shadow-sm focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
                <span aria-hidden="true" className="text-lg">
                  ⌕
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item, code, team..."
                  aria-label="Search the catalog"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-950 outline-none placeholder:text-slate-500"
                />
              </label>

              <label>
                <span className="sr-only">Filter by team</span>
                <select
                  value={teamFilter}
                  onChange={(event) => {
                    setTeamFilter(event.target.value as TeamFilter);
                    setCategoryFilter("");
                  }}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="all">All assigned teams</option>
                  {allowedTeams.map((team) => (
                    <option key={team} value={team}>
                      {teamLabels[team]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="sr-only">Filter by category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading && !dashboard ? (
            <div className="px-5 py-12 text-center text-sm font-medium text-slate-500">
              Loading nest inventory…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="m-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center sm:m-5">
              <p className="text-base font-semibold text-slate-800">
                No catalog items found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {error
                  ? "Dashboard data could not be loaded."
                  : "Try another search or clear one of the filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-3 bg-slate-50/70 p-4 sm:p-5">
              {pageItems.map((item) => {
                const hasStock = item.stockQuantity !== null;
                const stockClass = !hasStock
                  ? "bg-slate-100 text-slate-700"
                  : item.stockQuantity! <= 0
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-800";

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md sm:p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words text-base font-bold text-slate-950">
                              {item.name}
                            </h3>
                            <p className="mt-1 font-mono text-xs text-slate-500">
                              {item.code || "No item code"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${stockClass}`}
                          >
                            {hasStock
                              ? item.stockQuantity! <= 0
                                ? `0 ${item.stockUnit ?? item.uom} · Out of stock`
                                : `${item.stockQuantity!.toLocaleString()} ${item.stockUnit ?? item.uom} in stock`
                              : "Not tracked here"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${teamStyle(item.team)}`}
                          >
                            {teamIcon(item.team)} {teamLabels[item.team]}
                          </span>
                          <span
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              item.category
                                ? "bg-violet-50 text-violet-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {item.category ?? "Unassigned"}
                          </span>
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                            Unit: {item.uom}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Stock record
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                          {hasStock
                            ? `${item.stockQuantity!.toLocaleString()} ${item.stockUnit ?? item.uom}`
                            : "No balance recorded"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Last updated {formatUpdatedAt(item.stockUpdatedAt)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {filteredItems.length > 0 && (
            <nav
              aria-label="Inventory item pages"
              className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <p className="text-sm text-slate-600">
                Showing{" "}
                <span className="font-bold text-slate-900">
                  {firstVisibleItem}–{lastVisibleItem}
                </span>{" "}
                of{" "}
                <span className="font-bold text-slate-900">
                  {filteredItems.length}
                </span>{" "}
                items
              </p>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <button
                  type="button"
                  aria-label="Previous inventory page"
                  onClick={() =>
                    setInventoryPage((page) => Math.max(1, page - 1))
                  }
                  disabled={inventoryPage <= 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
                  Page {inventoryPage} of {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next inventory page"
                  onClick={() =>
                    setInventoryPage((page) => Math.min(pageCount, page + 1))
                  }
                  disabled={inventoryPage >= pageCount}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </nav>
          )}

          <div className="flex flex-col gap-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>
              Showing {filteredItems.length} of {items.length} catalog items
            </span>
            <span>
              “Not tracked here” is different from a recorded quantity of zero.
            </span>
          </div>
        </section>

        <p className="mt-5 text-xs text-slate-400">
          Nest assignments, catalog, and stock values are loaded from Supabase.
        </p>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  iconClass,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
  iconClass: string;
}) {
  return (
    <article className="flex min-h-28 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${iconClass}`}
      >
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
      </div>
    </article>
  );
}