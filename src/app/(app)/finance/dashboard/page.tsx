"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";

type Team = "flight" | "fulfilment" | "facilities";
type TeamFilter = Team | "All";

type OrderStatus =
  | "requested"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

type Nest = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  currencyCode: string;
};

type PurchaseLine = {
  id: string;
  requestId: string;
  reference: string;
  itemCode: string;
  itemName: string;
  team: Team;
  requestedQuantity: number;
  orderedQuantity: number;
  receivedQuantity: number;
  unit: string;
  unitCost: number;
  status: OrderStatus;
  updatedAt: string | null;
};

type DashboardData = {
  nests: Array<Omit<Nest, "currencyCode">>;
  selectedNest: Nest;
  lines: PurchaseLine[];
};

const teamLabels: Record<Team, string> = {
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

const statusLabels: Record<OrderStatus, string> = {
  requested: "Requested",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

const statuses: OrderStatus[] = [
  "requested",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isCommitted(status: OrderStatus) {
  return (
    status === "ordered" ||
    status === "partially_received" ||
    status === "received"
  );
}

function getStatusStyle(status: OrderStatus) {
  switch (status) {
    case "requested":
      return "bg-blue-50 text-blue-800";
    case "ordered":
      return "bg-violet-100 text-violet-900";
    case "partially_received":
      return "bg-amber-50 text-amber-900";
    case "received":
      return "bg-emerald-50 text-emerald-800";
    case "cancelled":
      return "bg-slate-100 text-slate-600";
  }
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedNestId, setSelectedNestId] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("All");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const query = selectedNestId
          ? `?nestId=${encodeURIComponent(selectedNestId)}`
          : "";

        const response = await fetch(`/api/finance/dashboard${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? "Unable to load Finance dashboard data.",
          );
        }

        const nextData = result as DashboardData;
        setData(nextData);

        if (!selectedNestId) {
          setSelectedNestId(nextData.selectedNest.id);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load Finance dashboard data.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [selectedNestId]);

  const lines = data?.lines ?? [];
  const selectedNest = data?.selectedNest;
  const currency = selectedNest?.currencyCode ?? "GHS";

  const teams = useMemo(
    () => [...new Set(lines.map((line) => line.team))].sort() as Team[],
    [lines],
  );

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();

    return lines.filter((line) => {
      const matchesTeam = teamFilter === "All" || line.team === teamFilter;
      const matchesStatus =
        statusFilter === "All" || line.status === statusFilter;

      const searchable = [
        line.reference,
        line.itemCode,
        line.itemName,
        teamLabels[line.team],
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesTeam &&
        matchesStatus &&
        (!query || searchable.includes(query))
      );
    });
  }, [lines, teamFilter, statusFilter, search]);

  const requestedEstimate = lines.reduce((total, line) => {
    if (line.status !== "requested") return total;
    return total + line.requestedQuantity * line.unitCost;
  }, 0);

  const committedCost = lines.reduce((total, line) => {
    if (!isCommitted(line.status)) return total;
    return total + line.orderedQuantity * line.unitCost;
  }, 0);

  const receivedCost = lines.reduce((total, line) => {
    if (line.status === "cancelled") return total;
    return total + line.receivedQuantity * line.unitCost;
  }, 0);

  const openLineCount = lines.filter(
    (line) =>
      line.status !== "received" && line.status !== "cancelled",
  ).length;

  const teamTotals = teams.map((team) => {
    const teamLines = lines.filter((line) => line.team === team);

    const requested = teamLines.reduce((total, line) => {
      if (line.status !== "requested") return total;
      return total + line.requestedQuantity * line.unitCost;
    }, 0);

    const committed = teamLines.reduce((total, line) => {
      if (!isCommitted(line.status)) return total;
      return total + line.orderedQuantity * line.unitCost;
    }, 0);

    const received = teamLines.reduce((total, line) => {
      if (line.status === "cancelled") return total;
      return total + line.receivedQuantity * line.unitCost;
    }, 0);

    return { team, requested, committed, received };
  });

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  const selectClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <nav
        aria-label="Finance dashboard views"
        className="flex flex-wrap gap-2"
      >
        <Link
          href="/finance/dashboard"
          aria-current="page"
          className="rounded-xl border border-violet-200 bg-violet-100 px-4 py-2.5 text-sm font-bold text-violet-950 shadow-sm"
        >
          Consumables costs
        </Link>
        <Link
          href="/finance/quarterly-expenses"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
        >
          Quarterly expenses
        </Link>
      </nav>

      <header className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-100 via-white to-white p-6 shadow-sm sm:flex sm:items-end sm:justify-between sm:gap-6 sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-100/80 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">
            Finance workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Nest purchase costs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review requested, purchased, and received costs by nest and team.
          </p>
        </div>

        <label className="relative mt-5 grid w-full gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 sm:mt-0 sm:w-72">
          Select nest
          <select
            value={selectedNestId}
            onChange={(event) => {
              setSelectedNestId(event.target.value);
              setTeamFilter("All");
              setStatusFilter("All");
            }}
            className={selectClass}
          >
            {(data?.nests ?? []).map((nest) => (
              <option key={nest.id} value={nest.id}>
                {nest.code} — {nest.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xl text-violet-900">
          ⌖
        </span>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
            Selected nest
          </p>
          <h2 className="mt-1 font-bold text-slate-950">
            {selectedNest
              ? `${selectedNest.code} · ${selectedNest.name}`
              : loading
                ? "Loading nest…"
                : "No accessible nest"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Costs are shown in {currency}.
          </p>
        </div>

        <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-bold tracking-wide text-violet-900 sm:ml-auto">
          LIVE SUPABASE DATA
        </span>
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Nest cost overview"
      >
        <StatCard
          label="Requested estimate"
          value={formatMoney(requestedEstimate, currency)}
          detail="Based on saved unit-price snapshots"
          icon="◷"
        />
        <StatCard
          label="Committed purchases"
          value={formatMoney(committedCost, currency)}
          detail="Ordered quantities"
          icon="↗"
        />
        <StatCard
          label="Received cost"
          value={formatMoney(receivedCost, currency)}
          detail="Quantities recorded as received"
          icon="✓"
        />
        <StatCard
          label="Open order lines"
          value={loading ? "…" : openLineCount}
          detail="Requested, ordered, or partly received"
          icon="▤"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50/80 to-white p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
            Cost breakdown
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            Cost by team
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Compare request estimates, committed purchase costs, and received
            costs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-violet-50/60 text-xs font-bold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-5 py-3">Team</th>
                <th className="px-5 py-3">Requested estimate</th>
                <th className="px-5 py-3">Committed purchase</th>
                <th className="px-5 py-3">Received cost</th>
              </tr>
            </thead>

            <tbody>
              {teamTotals.map(({ team, requested, committed, received }) => (
                <tr
                  key={team}
                  className="border-t border-slate-100 transition-colors hover:bg-violet-50/40"
                >
                  <td className="px-5 py-4 font-semibold text-slate-950">
                    {teamLabels[team]}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {formatMoney(requested, currency)}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {formatMoney(committed, currency)}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {formatMoney(received, currency)}
                  </td>
                </tr>
              ))}

              {teamTotals.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-slate-600"
                  >
                    No purchase lines are recorded for this nest.
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot className="border-t border-violet-100 bg-violet-50/50">
              <tr>
                <td className="px-5 py-4 font-bold text-slate-950">
                  Nest total
                </td>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {formatMoney(requestedEstimate, currency)}
                </td>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {formatMoney(committedCost, currency)}
                </td>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {formatMoney(receivedCost, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                Purchase detail
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Requested and purchased items
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Unit prices come from the saved purchase line snapshots.
              </p>
            </div>

            <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-500 shadow-sm transition focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-100 lg:w-72">
              <span className="text-lg text-violet-800" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item or reference"
                aria-label="Search purchase lines"
                className="w-full border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
              Filter by team
              <select
                value={teamFilter}
                onChange={(event) =>
                  setTeamFilter(event.target.value as TeamFilter)
                }
                className={selectClass}
              >
                <option value="All">All teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {teamLabels[team]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
              Filter by status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as OrderStatus | "All")
                }
                className={selectClass}
              >
                <option value="All">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading && !data ? (
          <p className="p-10 text-center text-sm text-slate-600">
            Loading purchase lines…
          </p>
        ) : filteredLines.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-600">
            No purchase lines match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-violet-50/60 text-xs font-bold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-5 py-3">Item / reference</th>
                  <th className="px-5 py-3">Team</th>
                  <th className="px-5 py-3">Requested</th>
                  <th className="px-5 py-3">Ordered</th>
                  <th className="px-5 py-3">Received</th>
                  <th className="px-5 py-3">Unit cost</th>
                  <th className="px-5 py-3">Current line value</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Updated</th>
                </tr>
              </thead>

              <tbody>
                {filteredLines.map((line) => {
                  const valueQuantity =
                    line.status === "requested"
                      ? line.requestedQuantity
                      : isCommitted(line.status)
                        ? line.orderedQuantity
                        : 0;

                  return (
                    <tr
                      key={line.id}
                      className="border-t border-slate-100 transition-colors hover:bg-violet-50/40"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">
                          {line.itemName}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-600">
                          {line.itemCode}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.reference}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {teamLabels[line.team]}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {line.requestedQuantity} {line.unit}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {line.orderedQuantity} {line.unit}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {line.receivedQuantity} {line.unit}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                        {formatMoney(line.unitCost, currency)}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">
                        {formatMoney(valueQuantity * line.unitCost, currency)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(line.status)}`}
                        >
                          {statusLabels[line.status]}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatUpdatedAt(line.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs leading-5 text-slate-600">
          Showing {filteredLines.length} of {lines.length} purchase lines.
          Cancelled lines are excluded from committed totals.
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Nest access, purchase requests, purchase quantities, and cost snapshots
        are loaded from Supabase.
      </p>
    </div>
  );
}