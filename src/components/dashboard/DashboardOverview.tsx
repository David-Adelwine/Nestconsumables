"use client";

import { StatCard } from "./StatCard";
import { StockTable, type StockItem } from "./StockTable";

export type NestOption = {
  id: string;
  code: string;
  name: string;
};

type DashboardOverviewProps = {
  canViewAllNests: boolean;
  nests: NestOption[];
  selectedNestId: string;
  onNestChange: (nestId: string) => void;
  stockItems: StockItem[];
  loading?: boolean;
};

export function DashboardOverview({
  canViewAllNests,
  nests,
  selectedNestId,
  onNestChange,
  stockItems,
  loading = false,
}: DashboardOverviewProps) {
  const selectedNest = nests.find((nest) => nest.id === selectedNestId);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            OPERATIONS OVERVIEW
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Consumables inventory
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {canViewAllNests
              ? "Review stock across the nests you are permitted to access."
              : "Review stock for your assigned nest."}
          </p>
        </div>

        {canViewAllNests ? (
          <label className="grid gap-1.5 text-xs font-medium text-gray-600">
            Select nest
            <select
              value={selectedNestId}
              onChange={(event) => onNestChange(event.target.value)}
              className="h-10 min-w-48 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-600"
            >
              {nests.map((nest) => (
                <option key={nest.id} value={nest.id}>
                  {nest.code} — {nest.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5">
            <p className="text-xs text-gray-500">Assigned nest</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {selectedNest?.code ?? "Loading…"}
            </p>
          </div>
        )}
      </div>

      <section
        className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Inventory overview"
      >
        <StatCard
          label="Items listed"
          value={loading ? "—" : stockItems.length}
          detail={`At ${selectedNest?.code ?? "selected nest"}`}
          icon="▤"
        />
        <StatCard
          label="Nests available to you"
          value={canViewAllNests ? nests.length : selectedNest ? 1 : "—"}
          detail={canViewAllNests ? "Based on your permissions" : "Your assigned nest"}
          icon="⌖"
        />
        <StatCard
          label="Inventory view"
          value={canViewAllNests ? "Multi-nest" : "Assigned nest"}
          detail="Access is controlled by your account"
          icon="◉"
        />
      </section>

      <div className="mt-8">
        <StockTable items={stockItems} loading={loading} />
      </div>
    </div>
  );
}