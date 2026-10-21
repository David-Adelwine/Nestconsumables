"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Cycle = {
  cycle_id: string;
  country: string;
  fiscal_year: number;
  quarter: number;
  currency_code: string;
  status: "draft" | "open" | "in_review" | "approved" | "closed";
};

type Nest = { id: string; code: string; name: string };

type Item = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string;
};

type Vendor = {
  vendor_id: string;
  vendor_name: string;
};

type Allocation = {
  allocation_id: string;
  cycle_id: string;
  nest_id: number;
  allocation_amount: number | string;
  notes: string | null;
};

type Entry = {
  expense_id: string;
  cycle_id: string;
  nest_id: number;
  item_code_snapshot: string;
  item_name_snapshot: string;
  vendor_name_snapshot: string;
  amount: number | string;
  comment: string;
  created_at: string;
};

type DashboardData = {
  countries: string[];
  country: string;
  currencyCode: string;
  nests: Nest[];
  cycles: Cycle[];
  selectedCycle: Cycle | null;
  allocations: Allocation[];
  entries: Entry[];
  items: Item[];
  vendors: Vendor[];
  permissions: {
    canManageCountry: boolean;
    canRecordNestIds: string[];
  };
};

type ApiResult = {
  cycle?: Cycle;
  allocation?: Allocation;
  expense?: Entry;
  error?: string;
};

const inputClass =
  "mt-1.5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-950 shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const selectClass =
  "mt-1.5 h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3.5 pr-10 text-sm font-semibold text-slate-950 shadow-sm outline-none transition hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const textareaClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-900/15 transition hover:-translate-y-0.5 hover:bg-violet-800 hover:shadow-lg hover:shadow-violet-900/20 active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-violet-600/25 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "block text-sm font-bold text-slate-800";
const helperClass = "mt-1.5 text-xs leading-5 text-slate-500";

const emptyData: DashboardData = {
  countries: [],
  country: "",
  currencyCode: "USD",
  nests: [],
  cycles: [],
  selectedCycle: null,
  allocations: [],
  entries: [],
  items: [],
  vendors: [],
  permissions: {
    canManageCountry: false,
    canRecordNestIds: [],
  },
};

function amount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function cycleLabel(cycle: Cycle): string {
  return `Q${cycle.quarter} ${cycle.fiscal_year}`;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    open: "border-emerald-200 bg-emerald-50 text-emerald-800",
    in_review: "border-blue-200 bg-blue-50 text-blue-800",
    approved: "border-violet-200 bg-violet-50 text-violet-800",
    closed: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
        styles[status] ?? "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          status === "open"
            ? "bg-emerald-600"
            : status === "draft"
              ? "bg-amber-500"
              : status === "closed"
                ? "bg-slate-500"
                : "bg-violet-600"
        }`}
      />
      {statusLabel(status)}
    </span>
  );
}

function MetricIcon({ type }: { type: "allocation" | "spent" | "remaining" }) {
  if (type === "allocation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M4 7.5h16M6.5 4.5h11A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V7a2.5 2.5 0 0 1 2.5-2.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 13h2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "spent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path
          d="M5 19V9m7 10V5m7 14v-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuarterlyExpenseWorkspace({
  mode = "planning",
}: {
  mode?: "planning" | "finance";
}) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [country, setCountry] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [expenseNestId, setExpenseNestId] = useState("");
  const [allocationDrafts, setAllocationDrafts] = useState<
    Record<string, string>
  >({});
  const [itemId, setItemId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (selection?: { country?: string; cycleId?: string }) => {
      setLoading(true);
      setError("");

      try {
        const selectedCountry = selection?.country ?? country;
        const selectedCycleId = selection?.cycleId ?? cycleId;
        const params = new URLSearchParams();

        if (selectedCountry) params.set("country", selectedCountry);
        if (selectedCycleId) params.set("cycleId", selectedCycleId);

        const response = await fetch(
          `/api/expenses/quarterly?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load expense data.");
        }

        const next = result as DashboardData;
        setData(next);
        setCountry(next.country);
        setCycleId(next.selectedCycle?.cycle_id ?? "");
        setAllocationDrafts(
          Object.fromEntries(
            next.allocations.map((allocation) => [
              String(allocation.nest_id),
              String(allocation.allocation_amount),
            ]),
          ),
        );

        if (
          !expenseNestId ||
          !next.permissions.canRecordNestIds.includes(expenseNestId)
        ) {
          setExpenseNestId(next.permissions.canRecordNestIds[0] ?? "");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load expense data.",
        );
      } finally {
        setLoading(false);
      }
    },
    [country, cycleId, expenseNestId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const activeCycle = data.selectedCycle;
  const canManageCountry = data.permissions.canManageCountry;
  const canRecordNestIds = data.permissions.canRecordNestIds;

  const spendByNest = useMemo(() => {
    const totals = new Map<number, number>();

    for (const entry of data.entries) {
      totals.set(
        entry.nest_id,
        (totals.get(entry.nest_id) ?? 0) + amount(entry.amount),
      );
    }

    return totals;
  }, [data.entries]);

  const allocationByNest = useMemo(
    () =>
      new Map(
        data.allocations.map((allocation) => [
          allocation.nest_id,
          amount(allocation.allocation_amount),
        ]),
      ),
    [data.allocations],
  );

  const totalAllocation = data.allocations.reduce(
    (sum, allocation) => sum + amount(allocation.allocation_amount),
    0,
  );
  const totalSpend = data.entries.reduce(
    (sum, entry) => sum + amount(entry.amount),
    0,
  );
  const totalRemaining = totalAllocation - totalSpend;

  const selectedNest = data.nests.find((nest) => nest.id === expenseNestId);
  const selectedNestNumber = Number(expenseNestId);
  const selectedAllocation = allocationByNest.get(selectedNestNumber) ?? 0;
  const selectedSpend = spendByNest.get(selectedNestNumber) ?? 0;
  const enteredAmount = amount(expenseAmount);
  const projectedRemaining =
    selectedAllocation - selectedSpend - enteredAmount;
  const hasAllocation = allocationByNest.has(selectedNestNumber);

  async function post(
    payload: Record<string, unknown>,
  ): Promise<ApiResult | null> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/expenses/quarterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiResult;

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to save.");
      }

      await load();
      return result;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const result = await post({
      action: "create_cycle",
      country,
      fiscalYear: form.get("fiscalYear"),
      quarter: form.get("quarter"),
    });

    if (result?.cycle?.cycle_id) {
      setCycleId(result.cycle.cycle_id);
      await load({
        country: result.cycle.country,
        cycleId: result.cycle.cycle_id,
      });
      setMessage("Quarter created. Add nest allocations, then open it.");
    }
  }

  async function saveAllocation(nestId: string) {
    if (!activeCycle) return;

    const result = await post({
      action: "save_allocation",
      cycleId: activeCycle.cycle_id,
      nestId,
      allocationAmount: allocationDrafts[nestId] ?? "0",
    });

    if (result) setMessage("Nest allocation saved.");
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCycle) return;

    const result = await post({
      action: "add_expense",
      cycleId: activeCycle.cycle_id,
      nestId: expenseNestId,
      itemId,
      vendorId,
      amount: expenseAmount,
      comment,
    });

    if (result) {
      setExpenseAmount("");
      setComment("");
      setMessage("Expense saved. The nest balance has been updated.");
    }
  }

  const spendAccess =
    canRecordNestIds.length > 0 && activeCycle?.status === "open";

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 p-6 text-white shadow-xl shadow-violet-950/10 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {mode === "finance" ? "Finance workspace" : "Nest workspace"}
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {mode === "finance"
                ? "Quarterly expense analysis"
                : "Nest expense tracker"}
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-violet-100/90 sm:text-base">
              See quarterly allocations, track spending, and understand what
              remains available for each nest.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex">
            <label className="min-w-32 text-xs font-bold uppercase tracking-wide text-violet-100">
              Country
              <div className="relative">
                <select
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value);
                    setCycleId("");
                    void load({
                      country: event.target.value,
                      cycleId: "",
                    });
                  }}
                  className="mt-1.5 h-12 w-full appearance-none rounded-xl border border-white/20 bg-white px-3.5 pr-9 text-sm font-bold normal-case tracking-normal text-slate-950 shadow-lg outline-none transition hover:bg-violet-50 focus:ring-4 focus:ring-white/30"
                >
                  {data.countries.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-500">
                  ▾
                </span>
              </div>
            </label>

            <label className="min-w-40 text-xs font-bold uppercase tracking-wide text-violet-100">
              Quarter
              <div className="relative">
                <select
                  value={cycleId}
                  onChange={(event) => {
                    setCycleId(event.target.value);
                    void load({ cycleId: event.target.value });
                  }}
                  className="mt-1.5 h-12 w-full appearance-none rounded-xl border border-white/20 bg-white px-3.5 pr-9 text-sm font-bold normal-case tracking-normal text-slate-950 shadow-lg outline-none transition hover:bg-violet-50 focus:ring-4 focus:ring-white/30"
                >
                  <option value="">Select a quarter</option>
                  {data.cycles.map((cycle) => (
                    <option key={cycle.cycle_id} value={cycle.cycle_id}>
                      {cycleLabel(cycle)} · {statusLabel(cycle.status)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-500">
                  ▾
                </span>
              </div>
            </label>
          </div>
        </div>

        {activeCycle && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/15 pt-5">
            <span className="text-sm font-semibold text-white">
              {activeCycle.country} · {cycleLabel(activeCycle)}
            </span>
            <StatusBadge status={activeCycle.status} />
            <span className="text-sm text-violet-100">
              {data.entries.length} recorded{" "}
              {data.entries.length === 1 ? "expense" : "expenses"}
            </span>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-medium text-rose-900 shadow-sm"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-700">
            !
          </span>
          <p>{error}</p>
        </div>
      )}

      {message && !error && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-semibold text-emerald-900 shadow-sm"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            ✓
          </span>
          <p>{message}</p>
        </div>
      )}

      {canManageCountry && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                Planning controls
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                Create a quarter
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-5 text-slate-600">
                Create a draft quarter, assign an amount to each nest, then
                open it for expense entries.
              </p>
            </div>

            <form
              onSubmit={createCycle}
              className="grid gap-3 sm:grid-cols-[140px_130px_auto]"
            >
              <label className={labelClass}>
                Fiscal year
                <input
                  required
                  name="fiscalYear"
                  type="number"
                  min="2020"
                  max="2100"
                  defaultValue={new Date().getFullYear()}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Quarter
                <select
                  name="quarter"
                  defaultValue="1"
                  className={selectClass}
                >
                  {[1, 2, 3, 4].map((quarter) => (
                    <option key={quarter} value={quarter}>
                      Q{quarter}
                    </option>
                  ))}
                </select>
              </label>

              <button
                disabled={saving || !country}
                className={`${primaryButtonClass} self-end`}
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Creating…
                  </>
                ) : (
                  "Create quarter"
                )}
              </button>
            </form>
          </div>
        </section>
      )}

      {loading && !data.country ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-700" />
          <p className="mt-4 text-sm font-semibold text-slate-700">
            Loading quarterly expense data…
          </p>
        </section>
      ) : !activeCycle ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path
                d="M5 5.5h14v14H5zM8 3.5v4m8-4v4M5 10h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">
            No quarter selected
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {canManageCountry
              ? "Create a quarter above, add the nest allocations, and open it when it is ready."
              : "No quarterly expense plan is available for your assigned country or nest yet."}
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Total allocated",
                value: totalAllocation,
                icon: "allocation" as const,
                color: "violet",
              },
              {
                label: "Total spent",
                value: totalSpend,
                icon: "spent" as const,
                color: "blue",
              },
              {
                label: "Remaining",
                value: totalRemaining,
                icon: "remaining" as const,
                color: totalRemaining < 0 ? "rose" : "emerald",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">
                      {metric.label}
                    </p>
                    <p
                      className={`mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${
                        metric.color === "rose"
                          ? "text-rose-700"
                          : "text-slate-950"
                      }`}
                    >
                      {money(metric.value, data.currencyCode)}
                    </p>
                  </div>
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      metric.color === "violet"
                        ? "bg-violet-100 text-violet-800"
                        : metric.color === "blue"
                          ? "bg-blue-100 text-blue-800"
                          : metric.color === "rose"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    <MetricIcon type={metric.icon} />
                  </span>
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {cycleLabel(activeCycle)} · {country}
                </p>
              </article>
            ))}
          </section>

          {canManageCountry && (
            <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-violet-100 bg-violet-50/70 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                    Allocation setup
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">
                    Nest quarterly amounts
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Set each nest’s spending limit. Saved expenses reduce its
                    remaining balance.
                  </p>
                </div>

                {activeCycle.status === "draft" && (
                  <button
                    type="button"
                    disabled={saving || data.allocations.length === 0}
                    onClick={() =>
                      void post({
                        action: "set_cycle_status",
                        cycleId: activeCycle.cycle_id,
                        status: "open",
                      }).then((result) => {
                        if (result) {
                          setMessage("Quarter opened for nest expenses.");
                        }
                      })
                    }
                    className={primaryButtonClass}
                    title={
                      data.allocations.length === 0
                        ? "Add at least one nest allocation first"
                        : undefined
                    }
                  >
                    {saving ? "Updating…" : "Open for expenses"}
                  </button>
                )}

                {activeCycle.status === "open" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void post({
                        action: "set_cycle_status",
                        cycleId: activeCycle.cycle_id,
                        status: "closed",
                      }).then((result) => {
                        if (result) setMessage("Quarter closed.");
                      })
                    }
                    className={secondaryButtonClass}
                  >
                    Close quarter
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Nest</th>
                      <th className="px-5 py-3.5">Allocated</th>
                      <th className="px-5 py-3.5">Spent</th>
                      <th className="px-5 py-3.5">Remaining</th>
                      <th className="px-5 py-3.5">Set amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nests.map((nest) => {
                      const nestNumber = Number(nest.id);
                      const allocated =
                        allocationByNest.get(nestNumber) ?? 0;
                      const spent = spendByNest.get(nestNumber) ?? 0;
                      const remaining = allocated - spent;
                      const draft = allocationDrafts[nest.id] ?? "";
                      const allocationExists =
                        allocationByNest.has(nestNumber);

                      return (
                        <tr
                          key={nest.id}
                          className="border-t border-slate-100 transition hover:bg-violet-50/40"
                        >
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-950">
                              {nest.code}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {nest.name}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">
                            {money(allocated, data.currencyCode)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">
                            {money(spent, data.currencyCode)}
                          </td>
                          <td
                            className={`px-5 py-4 font-bold ${
                              remaining < 0
                                ? "text-rose-700"
                                : "text-emerald-700"
                            }`}
                          >
                            {money(remaining, data.currencyCode)}
                            {remaining < 0 && (
                              <span className="ml-2 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                                Over
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <label className="sr-only" htmlFor={`allocation-${nest.id}`}>
                                Allocation for {nest.code}
                              </label>
                              <input
                                id={`allocation-${nest.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft}
                                disabled={activeCycle.status === "closed"}
                                onChange={(event) =>
                                  setAllocationDrafts((current) => ({
                                    ...current,
                                    [nest.id]: event.target.value,
                                  }))
                                }
                                className="h-10 w-36 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:bg-slate-100"
                                placeholder="0.00"
                              />
                              <button
                                type="button"
                                disabled={
                                  saving ||
                                  activeCycle.status === "closed" ||
                                  !draft
                                }
                                onClick={() => void saveAllocation(nest.id)}
                                className={secondaryButtonClass}
                              >
                                {saving
                                  ? "Saving…"
                                  : allocationExists
                                    ? "Update"
                                    : "Save"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {spendAccess && (
            <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md shadow-violet-950/5">
              <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-5 py-5 sm:px-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                  New expense
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Record nest spending
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Choose the expense item and vendor. The balance preview
                  updates before you save.
                </p>
              </div>

              <form onSubmit={addExpense} className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Nest
                    <select
                      required
                      value={expenseNestId}
                      onChange={(event) =>
                        setExpenseNestId(event.target.value)
                      }
                      className={selectClass}
                    >
                      {data.nests
                        .filter((nest) =>
                          canRecordNestIds.includes(nest.id),
                        )
                        .map((nest) => (
                          <option key={nest.id} value={nest.id}>
                            {nest.code} · {nest.name}
                          </option>
                        ))}
                    </select>
                    <span className={helperClass}>
                      Only nests assigned to your account are available.
                    </span>
                  </label>

                  <label className={labelClass}>
                    Expense item
                    <select
                      required
                      value={itemId}
                      onChange={(event) => setItemId(event.target.value)}
                      className={selectClass}
                    >
                      <option value="">Choose an expense item</option>
                      {data.items.map((item) => (
                        <option key={item.item_id} value={item.item_id}>
                          {item.item_code} · {item.item_name}
                        </option>
                      ))}
                    </select>
                    <span className={helperClass}>
                      Select an item from this country’s expense list.
                    </span>
                  </label>

                  <label className={labelClass}>
                    Vendor
                    <select
                      required
                      value={vendorId}
                      onChange={(event) => setVendorId(event.target.value)}
                      className={selectClass}
                    >
                      <option value="">Choose a vendor</option>
                      {data.vendors.map((vendor) => (
                        <option key={vendor.vendor_id} value={vendor.vendor_id}>
                          {vendor.vendor_name}
                        </option>
                      ))}
                    </select>
                    <span className={helperClass}>
                      Vendors are listed for the selected country.
                    </span>
                  </label>

                  <label className={labelClass}>
                    Cost{" "}
                    <span className="font-semibold text-slate-500">
                      ({data.currencyCode})
                    </span>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={expenseAmount}
                      onChange={(event) =>
                        setExpenseAmount(event.target.value)
                      }
                      className={inputClass}
                      placeholder="Enter the amount"
                    />
                    <span className={helperClass}>
                      Enter the amount charged by the vendor.
                    </span>
                  </label>

                  <label className={`${labelClass} sm:col-span-2`}>
                    Activity or comment{" "}
                    <span className="font-medium text-slate-500">
                      (optional)
                    </span>
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      rows={3}
                      className={textareaClass}
                      placeholder="Describe what was purchased or the work performed."
                    />
                  </label>
                </div>

                <div
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    projectedRemaining < 0 && enteredAmount > 0
                      ? "border-rose-200 bg-rose-50"
                      : "border-violet-200 bg-violet-50/70"
                  }`}
                  aria-live="polite"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-600">
                        Balance preview
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-950">
                        {selectedNest
                          ? `${selectedNest.code} · ${selectedNest.name}`
                          : "Selected nest"}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Remaining after save
                      </p>
                      <p
                        className={`mt-1 text-2xl font-extrabold tracking-tight ${
                          projectedRemaining < 0 && enteredAmount > 0
                            ? "text-rose-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {money(projectedRemaining, data.currencyCode)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-slate-200/80 pt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Allocated
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {money(selectedAllocation, data.currencyCode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Already spent
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {money(selectedSpend, data.currencyCode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        This expense
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {money(enteredAmount, data.currencyCode)}
                      </p>
                    </div>
                  </div>

                  {projectedRemaining < 0 && enteredAmount > 0 && (
                    <p className="mt-4 rounded-xl border border-rose-200 bg-white/70 px-3 py-2 text-sm font-bold text-rose-800">
                      This expense will exceed the nest allocation. You can
                      still save it; the over-allocation will remain visible.
                    </p>
                  )}

                  {!hasAllocation && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                      This nest has no allocation for the selected quarter.
                      Ask the planning owner to add one.
                    </p>
                  )}
                </div>

                {(!data.items.length || !data.vendors.length) && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                    This country’s expense item or vendor list is empty. The
                    catalog must be populated before expenses can be recorded.
                  </p>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">
                    Saving records the expense immediately and updates the
                    balance.
                  </p>
                  <button
                    disabled={
                      saving ||
                      !hasAllocation ||
                      !data.items.length ||
                      !data.vendors.length
                    }
                    className={primaryButtonClass}
                  >
                    {saving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Saving expense…
                      </>
                    ) : (
                      <>
                        Save expense
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                  Country overview
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Nest comparison
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Compare allocation, spending, and balance for each nest you
                  can access.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {data.nests.length}{" "}
                {data.nests.length === 1 ? "nest" : "nests"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Nest</th>
                    <th className="px-5 py-3.5">Allocated</th>
                    <th className="px-5 py-3.5">Spent</th>
                    <th className="px-5 py-3.5">Remaining</th>
                    <th className="px-5 py-3.5">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nests.map((nest) => {
                    const nestNumber = Number(nest.id);
                    const allocated =
                      allocationByNest.get(nestNumber) ?? 0;
                    const spent = spendByNest.get(nestNumber) ?? 0;
                    const remaining = allocated - spent;
                    const usage =
                      allocated > 0 ? (spent / allocated) * 100 : 0;

                    return (
                      <tr
                        key={nest.id}
                        className="border-t border-slate-100 transition hover:bg-violet-50/40"
                      >
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-950">
                            {nest.code}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {nest.name}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-800">
                          {money(allocated, data.currencyCode)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-800">
                          {money(spent, data.currencyCode)}
                        </td>
                        <td
                          className={`px-5 py-4 font-bold ${
                            remaining < 0
                              ? "text-rose-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {money(remaining, data.currencyCode)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-28 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  usage > 100
                                    ? "bg-rose-500"
                                    : usage >= 80
                                      ? "bg-amber-500"
                                      : "bg-violet-600"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(0, usage))}%`,
                                }}
                              />
                            </div>
                            <span
                              className={`text-xs font-bold ${
                                usage > 100
                                  ? "text-rose-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {usage.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-end sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                  Audit history
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Expense log
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Saved expenses remain listed here for finance analysis.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                {data.entries.length}{" "}
                {data.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {data.entries.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <MetricIcon type="spent" />
                </div>
                <h3 className="mt-3 font-bold text-slate-900">
                  No expenses recorded yet
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Saved expenses for this quarter will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Nest</th>
                      <th className="px-5 py-3.5">Expense item</th>
                      <th className="px-5 py-3.5">Vendor</th>
                      <th className="px-5 py-3.5">Cost</th>
                      <th className="px-5 py-3.5">Activity / comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <tr
                        key={entry.expense_id}
                        className="border-t border-slate-100 align-top transition hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-800">
                          {data.nests.find(
                            (nest) => Number(nest.id) === entry.nest_id,
                          )?.code ?? "Nest"}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900">
                            {entry.item_name_snapshot}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            Code: {entry.item_code_snapshot}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-800">
                          {entry.vendor_name_snapshot}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-extrabold text-slate-950">
                          {money(amount(entry.amount), data.currencyCode)}
                        </td>
                        <td className="max-w-xs px-5 py-4 text-slate-600">
                          {entry.comment || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}