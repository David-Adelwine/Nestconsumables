"use client";

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
      return "bg-violet-50 text-violet-800";
    case "partially_received":
      return "bg-amber-50 text-amber-800";
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
    () =>
      [...new Set(lines.map((line) => line.team))].sort() as Team[],
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            FINANCE
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Nest purchase costs
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Review requested, purchased, and received costs by nest and team.
          </p>
        </div>

        <label className="grid gap-1.5 text-xs font-medium text-gray-600">
          Select nest
          <select
            value={selectedNestId}
            onChange={(event) => {
              setSelectedNestId(event.target.value);
              setTeamFilter("All");
              setStatusFilter("All");
            }}
            className="h-10 min-w-64 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-600"
          >
            {(data?.nests ?? []).map((nest) => (
              <option key={nest.id} value={nest.id}>
                {nest.code} — {nest.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xl text-emerald-800">
          ⌖
        </span>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Selected nest
          </p>
          <h2 className="mt-1 font-semibold text-gray-900">
            {selectedNest
              ? `${selectedNest.code} · ${selectedNest.name}`
              : loading
                ? "Loading nest…"
                : "No accessible nest"}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Costs are shown in {currency}.
          </p>
        </div>

        <span className="w-fit rounded border border-emerald-100 bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-emerald-800 sm:ml-auto">
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

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900">
            Cost by team
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Compare request estimates, committed purchase costs, and received
            costs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Team</th>
                <th className="px-5 py-3">Requested estimate</th>
                <th className="px-5 py-3">Committed purchase</th>
                <th className="px-5 py-3">Received cost</th>
              </tr>
            </thead>

            <tbody>
              {teamTotals.map(({ team, requested, committed, received }) => (
                <tr key={team} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {teamLabels[team]}
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    {formatMoney(requested, currency)}
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    {formatMoney(committed, currency)}
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    {formatMoney(received, currency)}
                  </td>
                </tr>
              ))}

              {teamTotals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                    No purchase lines are recorded for this nest.
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td className="px-5 py-4 font-semibold text-gray-900">
                  Nest total
                </td>
                <td className="px-5 py-4 font-semibold text-gray-900">
                  {formatMoney(requestedEstimate, currency)}
                </td>
                <td className="px-5 py-4 font-semibold text-gray-900">
                  {formatMoney(committedCost, currency)}
                </td>
                <td className="px-5 py-4 font-semibold text-gray-900">
                  {formatMoney(receivedCost, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Requested and purchased items
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Unit prices come from the saved purchase line snapshots.
              </p>
            </div>

            <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 lg:w-64">
              <span className="text-gray-400" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item or reference"
                aria-label="Search purchase lines"
                className="w-full border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="grid gap-1 text-xs font-medium text-gray-600">
              Team
              <select
                value={teamFilter}
                onChange={(event) =>
                  setTeamFilter(event.target.value as TeamFilter)
                }
                className="h-9 min-w-44 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="All">All teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {teamLabels[team]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-gray-600">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as OrderStatus | "All")
                }
                className="h-9 min-w-48 rounded-lg border border-gray-200 bg-white px-3 text-sm"
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
          <p className="p-8 text-center text-sm text-gray-500">
            Loading purchase lines…
          </p>
        ) : filteredLines.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            No purchase lines match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
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
                    <tr key={line.id} className="border-t border-gray-100">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">
                          {line.itemName}
                        </p>
                        <p className="mt-1 font-mono text-xs text-gray-500">
                          {line.itemCode}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {line.reference}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {teamLabels[line.team]}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {line.requestedQuantity} {line.unit}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {line.orderedQuantity} {line.unit}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {line.receivedQuantity} {line.unit}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                        {formatMoney(line.unitCost, currency)}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-medium text-gray-900">
                        {formatMoney(
                          valueQuantity * line.unitCost,
                          currency,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${getStatusStyle(line.status)}`}
                        >
                          {statusLabels[line.status]}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                        {formatUpdatedAt(line.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          Showing {filteredLines.length} of {lines.length} purchase lines.
          Cancelled lines are excluded from committed totals.
        </div>
      </section>

      <p className="text-xs text-gray-400">
        Nest access, purchase requests, purchase quantities, and cost snapshots
        are loaded from Supabase.
      </p>
    </div>
  );
}