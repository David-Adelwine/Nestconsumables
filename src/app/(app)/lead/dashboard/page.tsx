"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  }, [selectedNestId]);

  const items = dashboard?.items ?? [];
  const allowedTeams = dashboard?.allowedTeams ?? [];
  const assignedNest = dashboard?.assignedNest;
  const availableNests = dashboard?.availableNests ?? [];

  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          items.map((item) => item.category || "Unassigned"),
        ),
      ].sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesTeam =
        teamFilter === "all" || item.team === teamFilter;

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
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
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
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
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

        <section className="mt-7 flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-5 sm:flex-row sm:items-center">
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
          className="mt-5 grid gap-3 sm:grid-cols-3"
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

        <section className="mt-9">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Inventory by team</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose a team to review its catalog and recorded stock at this
              nest.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {teamSummaries.map(({ team, catalogCount, trackedCount: teamTrackedCount }) => {
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
                  className={`rounded-xl border bg-white p-4 text-left transition ${
                    selected
                      ? "border-emerald-500 ring-2 ring-emerald-100"
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
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${teamStyle(team)}`}
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
                    {selected ? "Showing this team" : `View ${teamLabels[team]}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {assignedNest?.code ?? "Assigned nest"}
                {teamFilter !== "all"
                  ? ` · ${teamLabels[teamFilter]}`
                  : ""}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Catalog and nest stock
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Stock is shown for your selected nest. Catalog items are
                limited to your assigned team access.
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_200px_220px]">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400">
                <span aria-hidden="true" className="text-lg">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item, code, team..."
                  aria-label="Search the catalog"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
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
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
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
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
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
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Loading nest inventory…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {error
                ? "Dashboard data could not be loaded."
                : "No catalog items match your search or filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <TableHeading>Item</TableHeading>
                    <TableHeading>Team</TableHeading>
                    <TableHeading>Category</TableHeading>
                    <TableHeading>UOM</TableHeading>
                    <TableHeading>
                      Stock at {assignedNest?.code ?? "nest"}
                    </TableHeading>
                    <TableHeading>Last updated</TableHeading>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((item) => {
                    const hasStock = item.stockQuantity !== null;

                    return (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {item.name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-slate-400">
                            {item.code}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-700">
                          {teamLabels[item.team]}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.category
                                ? "bg-slate-100 text-slate-700"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {item.category ?? "Unassigned"}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm text-slate-600">
                          {item.uom}
                        </td>

                        <td className="px-4 py-4 text-sm">
                          {hasStock ? (
                            <span className="font-semibold text-slate-800">
                              {item.stockQuantity?.toLocaleString()}{" "}
                              <span className="font-normal text-slate-500">
                                {item.stockUnit ?? item.uom}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Not tracked here
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">
                          {formatUpdatedAt(item.stockUpdatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    <article className="flex min-h-28 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
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

function TableHeading({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}