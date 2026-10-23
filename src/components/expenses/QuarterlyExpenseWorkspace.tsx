"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type WorkspaceMode = "planning" | "finance";
type TabName = "overview" | "entries" | "budgets" | "fuel" | "catalog";
type Row = Record<string, any>;

type WorkspaceData = {
  countries: Array<Row | string>;
  country: string;
  currencyCode: string;
  nests: Array<Row | string | number>;
  cycles: Row[];
  selectedCycle: Row | null;
  allocations: Row[];
  budgetLines: Row[];
  entries: Row[];
  historyEntries: Row[];
  historyAllocations: Row[];
  historyFuelPlans: Row[];
  fuelPlans: Row[];
  items: Row[];
  vendors: Row[];
  glCodes: Row[];
  fuelAssets: Row[];
  quotes: Row[];
  countryComparison: Row[];
  permissions: {
    canManageCountry?: boolean;
    canRecordNestIds?: string[];
  };
};

const EMPTY_DATA: WorkspaceData = {
  countries: [],
  country: "",
  currencyCode: "",
  nests: [],
  cycles: [],
  selectedCycle: null,
  allocations: [],
  budgetLines: [],
  entries: [],
  historyEntries: [],
  historyAllocations: [],
  historyFuelPlans: [],
  fuelPlans: [],
  items: [],
  vendors: [],
  glCodes: [],
  fuelAssets: [],
  quotes: [],
  countryComparison: [],
  permissions: {},
};

const tabs: { id: TabName; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "entries", label: "Activities & expenses" },
  { id: "budgets", label: "Budget lines" },
  { id: "fuel", label: "Fuel" },
  { id: "catalog", label: "Country catalogs" },
];

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function money(value: unknown, currency = "") {
  const amount = Number(value ?? 0);
  return `${currency ? `${currency} ` : ""}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)}`;
}

function numberValue(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function getCountryValue(item: Row | string) {
  if (typeof item === "string") return item;

  return (
    item.country_code ??
    item.country ??
    item.code ??
    item.name ??
    null
  );
}

function getCountryLabel(item: Row | string, value: string) {
  if (typeof item === "string") return item;

  return item.country_name ?? item.name ?? value;
}

function getNestId(nest: Row | string | number) {
  if (typeof nest === "string" || typeof nest === "number") return nest;

  return nest.nest_id ?? nest.nestId ?? nest.id ?? null;
}

function getNestLabel(nest: Row | string | number) {
  if (typeof nest === "string" || typeof nest === "number") {
    return String(nest);
  }

  return nest.nest_name ?? nest.nestName ?? nest.name ?? nest.label ?? "Nest";
}

function statusLabel(value: unknown) {
  return text(value, "draft").replaceAll("_", " ");
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Card({
  title,
  value,
  detail,
  accent = "violet",
}: {
  title: string;
  value: string;
  detail?: string;
  accent?: "violet" | "blue" | "emerald" | "amber";
}) {
  const accents = {
    violet: "bg-violet-50 text-violet-800 ring-violet-100",
    blue: "bg-blue-50 text-blue-800 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      )}
      <span
        className={cx(
          "mt-4 inline-flex h-1.5 w-12 rounded-full ring-4",
          accents[accent],
        )}
      />
    </div>
  );
}

function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15";

const selectClass = `${inputClass} cursor-pointer`;

const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-600/20 disabled:cursor-not-allowed disabled:opacity-50";

const buttonSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:opacity-50";

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-700">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: unknown }) {
  const normalized = String(status ?? "draft").toLowerCase();
  const style =
    normalized === "approved" || normalized === "open"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : normalized === "rejected" || normalized === "closed"
        ? "bg-slate-100 text-slate-600 ring-slate-200"
        : normalized === "in_review"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-violet-50 text-violet-800 ring-violet-200";

  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset",
        style,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cx(
        "border-t border-slate-100 px-4 py-3 align-top text-sm text-slate-700",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function QuarterlyExpenseWorkspace({
  mode = "planning",
}: {
  mode?: WorkspaceMode;
}) {
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);
  const [country, setCountry] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [activeTab, setActiveTab] = useState<TabName>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isFinance = mode === "finance";
  const canManage = Boolean(data.permissions.canManageCountry);
  const canRecordNestIds = data.permissions.canRecordNestIds ?? [];

  const selectedCycle =
    data.cycles.find((cycle) => String(cycle.cycle_id) === cycleId) ??
    data.selectedCycle ??
    null;

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (cycleId) params.set("cycleId", cycleId);
    const query = params.toString();
    return `/api/expenses/quarterly${query ? `?${query}` : ""}`;
  }, [country, cycleId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(requestUrl, { cache: "no-store" });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to load quarterly expense data.");
      }

      const next = { ...EMPTY_DATA, ...body } as WorkspaceData;
      setData(next);

      if (!country && next.country) setCountry(next.country);

      if (!cycleId && next.selectedCycle?.cycle_id) {
        setCycleId(String(next.selectedCycle.cycle_id));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load quarterly expense data.",
      );
    } finally {
      setLoading(false);
    }
  }, [requestUrl, country, cycleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function submitAction(
    action: string,
    values: Record<string, unknown>,
    options?: { quiet?: boolean },
  ) {
    setSaving(true);
    setErrorMessage("");
    if (!options?.quiet) setSuccessMessage("");

    try {
      const response = await fetch("/api/expenses/quarterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          country,
          cycleId: cycleId || selectedCycle?.cycle_id || null,
          ...values,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to save quarterly expense data.");
      }

      if (!options?.quiet) setSuccessMessage("Saved successfully.");
      await loadData();
      return body;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save quarterly expense data.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  function handleForm(
    action: string,
    readValues: (form: HTMLFormElement) => Record<string, unknown>,
    success = "Saved successfully.",
  ) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = readValues(form);
      const result = await submitAction(action, values, { quiet: true });

      if (result) {
        form.reset();
        setSuccessMessage(success);
      }
    };
  }

  const currency = selectedCycle?.currency_code || data.currencyCode || "";
  const cycleEntries = data.entries ?? [];
  const currentAllocations = data.allocations ?? [];
  const currentBudgetLines = data.budgetLines ?? [];

  const summary = useMemo(() => {
    const allocated = currentAllocations.reduce(
      (sum, allocation) => sum + numberValue(allocation.allocated_amount),
      0,
    );

    const spent = cycleEntries
      .filter(
        (entry) => !["rejected", "cancelled"].includes(String(entry.status)),
      )
      .reduce(
        (sum, entry) =>
          sum +
          numberValue(entry.actual_amount ?? entry.amount ?? entry.total_cost),
        0,
      );

    const fuelForecast = (data.fuelPlans ?? []).reduce((sum, plan) => {
      const actual = plan.actual_quarterly_cost;
      const forecast = plan.quarterly_cost ?? plan.estimated_quarterly_cost;
      return sum + numberValue(actual ?? forecast);
    }, 0);

    const remaining = allocated - spent - fuelForecast;

    return { allocated, spent, fuelForecast, remaining };
  }, [currentAllocations, cycleEntries, data.fuelPlans]);

  const entriesByGroup = useMemo(() => {
    const groups = new Map<string, number>();

    for (const entry of cycleEntries) {
      if (["rejected", "cancelled"].includes(String(entry.status))) continue;

      const group = text(
        entry.summary_group || entry.category || entry.gl_code,
        "Uncategorised",
      );

      groups.set(
        group,
        (groups.get(group) ?? 0) +
          numberValue(entry.actual_amount ?? entry.amount ?? entry.total_cost),
      );
    }

    return Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  }, [cycleEntries]);

  type BudgetVarianceRow = Row & {
    spent: number;
    variance: number;
  };

  const budgetVarianceRows = useMemo<BudgetVarianceRow[]>(() => {
    return currentBudgetLines.map((line): BudgetVarianceRow => {
      const spent = cycleEntries
        .filter((entry) => {
          if (line.gl_code && entry.gl_code) {
            return String(line.gl_code) === String(entry.gl_code);
          }

          const lineGroup = line.summary_group || line.category;
          const entryGroup = entry.summary_group || entry.category;

          return Boolean(
            lineGroup && entryGroup && lineGroup === entryGroup,
          );
        })
        .filter(
          (entry) =>
            !["rejected", "cancelled"].includes(String(entry.status)),
        )
        .reduce(
          (sum, entry) =>
            sum +
            numberValue(
              entry.actual_amount ?? entry.amount ?? entry.total_cost,
            ),
          0,
        );

      const budget = numberValue(line.budget_amount);

      return {
        ...line,
        spent,
        variance: budget - spent,
      };
    });
  }, [currentBudgetLines, cycleEntries]);

  function nestName(nestId: unknown) {
    const nest = data.nests.find(
      (item) => String(getNestId(item)) === String(nestId),
    );

    return nest ? getNestLabel(nest) : text(nestId);
  }

  function refreshButton() {
    return (
      <button
        type="button"
        className={buttonSecondary}
        onClick={() => void loadData()}
        disabled={loading || saving}
      >
        Refresh data
      </button>
    );
  }

  if (loading && !data.countries.length) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading quarterly expense workspace…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 p-6 text-white shadow-xl shadow-violet-950/10 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">
              {isFinance ? "Finance workspace" : "Nest expense workspace"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Quarterly expense planning
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100 sm:text-base">
              Plan quarterly allocations, record activities and vendor costs,
              and follow how each nest is using its available amount.
            </p>
          </div>

          <div className="min-w-52 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">
              Current quarter
            </p>
            <p className="mt-1 text-lg font-bold">
              {selectedCycle
                ? `${selectedCycle.fiscal_year} · ${selectedCycle.quarter}`
                : "No quarter selected"}
            </p>
            {selectedCycle && (
              <div className="mt-2">
                <StatusPill status={selectedCycle.status} />
              </div>
            )}
          </div>
        </div>
      </div>

      {(errorMessage || successMessage) && (
        <div
          role={errorMessage ? "alert" : "status"}
          className={cx(
            "mb-5 rounded-xl border px-4 py-3 text-sm font-medium",
            errorMessage
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <section className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Country">
          <select
            className={selectClass}
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setCycleId("");
            }}
          >
            <option value="">Select a country</option>
            {data.countries.map((item, index) => {
              const value = getCountryValue(item);

              if (value === null || value === "") return null;

              return (
                <option
                  key={`country-${String(value)}-${index}`}
                  value={String(value)}
                >
                  {getCountryLabel(item, String(value))}
                </option>
              );
            })}
          </select>
        </Field>

        <Field label="View quarter">
          <select
            className={selectClass}
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
          >
            <option value="">Select a quarter</option>
            {data.cycles.map((cycle, index) => (
              <option
                key={`cycle-${String(cycle.cycle_id ?? "unknown")}-${index}`}
                value={String(cycle.cycle_id ?? "")}
              >
                {cycle.fiscal_year} · {cycle.quarter} ·{" "}
                {statusLabel(cycle.status)}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-end">
          {canManage && (
            <form
              className="grid w-full grid-cols-[1fr_1fr_auto] gap-2"
              onSubmit={handleForm(
                "create_cycle",
                (form) => {
                  const values = new FormData(form);

                  return {
                    fiscal_year: Number(values.get("fiscal_year")),
                    quarter: values.get("quarter"),
                    currency_code: values.get("currency_code"),
                  };
                },
                "Quarter created.",
              )}
            >
              <Field label="Year">
                <input
                  className={inputClass}
                  name="fiscal_year"
                  type="number"
                  min="2020"
                  max="2100"
                  defaultValue={new Date().getFullYear()}
                  required
                />
              </Field>

              <Field label="New quarter">
                <select
                  className={selectClass}
                  name="quarter"
                  defaultValue="1"
                >
                  <option value="1">Q1</option>
                  <option value="2">Q2</option>
                  <option value="3">Q3</option>
                  <option value="4">Q4</option>
                </select>
              </Field>

              <div className="flex items-end">
                <button
                  className={buttonPrimary}
                  disabled={saving || !country}
                >
                  Create
                </button>
              </div>

              <input
                type="hidden"
                name="currency_code"
                value={data.currencyCode || ""}
              />
            </form>
          )}
        </div>

        <div className="flex items-end justify-end">{refreshButton()}</div>
      </section>

      <nav
        aria-label="Expense workspace sections"
        className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition",
              activeTab === tab.id
                ? "bg-violet-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="space-y-7">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              title="Nest allocations"
              value={money(summary.allocated, currency)}
              detail="Total allocated across the selected quarter"
              accent="violet"
            />
            <Card
              title="Recorded expenses"
              value={money(summary.spent, currency)}
              detail="Submitted and approved expense entries"
              accent="blue"
            />
            <Card
              title="Fuel plan"
              value={money(summary.fuelForecast, currency)}
              detail="Forecast, or recorded actual fuel cost"
              accent="amber"
            />
            <Card
              title="Unallocated balance"
              value={money(summary.remaining, currency)}
              detail="Allocations less expenses and fuel plan"
              accent={summary.remaining < 0 ? "amber" : "emerald"}
            />
          </section>

          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Country planning"
                title="Allocate the quarter to each nest"
                description="Enter the amount each nest should organise its quarterly expenses around."
              />

              {!selectedCycle ? (
                <EmptyState>
                  Create or select a quarter before setting nest allocations.
                </EmptyState>
              ) : (
                <form
                  onSubmit={handleForm(
                    "save_allocations",
                    (form) => {
                      const values = new FormData(form);
                      const allocations = data.nests
                        .map((nest) => {
                          const nestId = getNestId(nest);
                          if (nestId === null) return null;

                          return {
                            nest_id: nestId,
                            allocated_amount: Number(
                              values.get(`allocation_${nestId}`) || 0,
                            ),
                          };
                        })
                        .filter((allocation) => allocation !== null);

                      return { allocations };
                    },
                    "Nest allocations saved.",
                  )}
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.nests.map((nest, index) => {
                      const nestId = getNestId(nest);
                      if (nestId === null) return null;

                      const allocation = currentAllocations.find(
                        (row) => String(row.nest_id) === String(nestId),
                      );

                      return (
                        <Field
                          key={`nest-allocation-${String(nestId)}-${index}`}
                          label={getNestLabel(nest)}
                        >
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                              {currency}
                            </span>
                            <input
                              className={`${inputClass} pl-14`}
                              type="number"
                              min="0"
                              step="0.01"
                              name={`allocation_${nestId}`}
                              defaultValue={allocation?.allocated_amount ?? 0}
                            />
                          </div>
                        </Field>
                      );
                    })}
                  </div>

                  <button
                    className={`${buttonPrimary} mt-4`}
                    disabled={saving}
                  >
                    Save allocations
                  </button>
                </form>
              )}
            </section>
          )}

          {canManage && selectedCycle && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Quarter workflow"
                title="Review and close the quarter"
                description="Move the quarter through planning, review, approval, and close."
              />

              <div className="flex flex-wrap items-center gap-3">
                <StatusPill status={selectedCycle.status} />
                {(
                  [
                    ["open", "Open for planning"],
                    ["in_review", "Send for review"],
                    ["approved", "Approve quarter"],
                    ["closed", "Close quarter"],
                  ] as const
                ).map(([status, label]) => (
                  <button
                    type="button"
                    key={status}
                    className={buttonSecondary}
                    disabled={saving || selectedCycle.status === status}
                    onClick={() =>
                      void submitAction("set_cycle_status", { status })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Quarter activity"
                title="Spending by category"
                description="Recorded entries grouped by summary category."
              />

              {entriesByGroup.length ? (
                <div className="space-y-4">
                  {entriesByGroup.map(([group, amount]) => {
                    const max = Math.max(
                      ...entriesByGroup.map((entry) => entry[1]),
                      1,
                    );
                    const percent = Math.max(3, (amount / max) * 100);

                    return (
                      <div key={group}>
                        <div className="mb-1.5 flex justify-between gap-3 text-sm">
                          <span className="font-semibold text-slate-700">
                            {group}
                          </span>
                          <span className="font-bold text-slate-900">
                            {money(amount, currency)}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-violet-600"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState>
                  No expense entries have been recorded for this quarter.
                </EmptyState>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Nest allocations"
                title="Allocation and balance"
                description="Compare each nest’s allocation with its recorded activity."
              />

              {currentAllocations.length ? (
                <TableWrap>
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        <Th>Nest</Th>
                        <Th>Allocated</Th>
                        <Th>Recorded</Th>
                        <Th>Available</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentAllocations.map((allocation, index) => {
                        const spent = cycleEntries
                          .filter(
                            (entry) =>
                              String(entry.nest_id) ===
                                String(allocation.nest_id) &&
                              !["rejected", "cancelled"].includes(
                                String(entry.status),
                              ),
                          )
                          .reduce(
                            (sum, entry) =>
                              sum +
                              numberValue(
                                entry.actual_amount ??
                                  entry.amount ??
                                  entry.total_cost,
                              ),
                            0,
                          );

                        const allocated = numberValue(
                          allocation.allocated_amount,
                        );

                        return (
                          <tr
                            key={`allocation-${String(
                              allocation.allocation_id ?? allocation.nest_id ?? "unknown",
                            )}-${index}`}
                          >
                            <Td className="font-semibold text-slate-900">
                              {nestName(allocation.nest_id)}
                            </Td>
                            <Td>{money(allocated, currency)}</Td>
                            <Td>{money(spent, currency)}</Td>
                            <Td
                              className={
                                allocated - spent < 0
                                  ? "font-bold text-rose-700"
                                  : "font-bold text-emerald-700"
                              }
                            >
                              {money(allocated - spent, currency)}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              ) : (
                <EmptyState>
                  No nest allocations are set for this quarter.
                </EmptyState>
              )}
            </div>
          </section>

          {isFinance && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeading
                  eyebrow="Country comparison"
                  title="Compare country allocations"
                  description="USD comparison uses each quarter’s stored FX rate. Check the source currency before making budget decisions."
                />

                {data.countryComparison.length ? (
                  <TableWrap>
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Country</Th>
                          <Th>Currency</Th>
                          <Th>Allocated</Th>
                          <Th>Recorded</Th>
                          <Th>Remaining</Th>
                          <Th>Allocated USD</Th>
                          <Th>Recorded USD</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.countryComparison.map((row, index) => (
                          <tr key={`country-comparison-${String(row.country ?? "unknown")}-${index}`}>
                            <Td className="font-semibold text-slate-900">
                              {text(row.country_name || row.country)}
                            </Td>
                            <Td>{text(row.currencyCode || row.currency_code)}</Td>
                            <Td>{money(row.allocated, row.currencyCode)}</Td>
                            <Td>{money(row.committed, row.currencyCode)}</Td>
                            <Td>{money(row.remaining, row.currencyCode)}</Td>
                            <Td>{money(row.allocatedUsd, "USD")}</Td>
                            <Td>{money(row.committedUsd, "USD")}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : (
                  <EmptyState>
                    No country comparison data is available.
                  </EmptyState>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeading
                  eyebrow="History"
                  title="Previous quarter activity"
                  description="Review prior expense entries alongside the current plan."
                />

                {data.historyEntries.length ? (
                  <TableWrap>
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Quarter</Th>
                          <Th>Nest</Th>
                          <Th>Activity</Th>
                          <Th>Vendor</Th>
                          <Th>Category / GL</Th>
                          <Th>Amount</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.historyEntries.map((entry, index) => (
                          <tr key={`expense-entry-${String(entry.entry_id ?? "unknown")}-${index}`}>
                            <Td>{text(entry.quarter_label || entry.quarter)}</Td>
                            <Td>{nestName(entry.nest_id)}</Td>
                            <Td className="font-semibold text-slate-900">
                              {text(entry.description)}
                            </Td>
                            <Td>{text(entry.vendor_name)}</Td>
                            <Td>
                              {text(
                                entry.summary_group ||
                                  entry.gl_code ||
                                  entry.category,
                              )}
                            </Td>
                            <Td>
                              {money(
                                entry.actual_amount ??
                                  entry.amount ??
                                  entry.total_cost,
                                entry.currency_code || currency,
                              )}
                            </Td>
                            <Td>
                              <StatusPill status={entry.status} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : (
                  <EmptyState>
                    No prior quarter entries are available for this country.
                  </EmptyState>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {activeTab === "entries" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              eyebrow="Record an activity"
              title="Add an expense or planned activity"
              description="Choose the nest, item, vendor, and amount. The available balance is shown before you save."
            />

            {!selectedCycle ? (
              <EmptyState>
                Select or create a quarter before adding an activity.
              </EmptyState>
            ) : (
              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                onSubmit={handleForm(
                  "add_expense",
                  (form) => {
                    const values = new FormData(form);
                    const itemId = String(values.get("item_id") || "");
                    const item = data.items.find(
                      (row) => String(row.item_id) === itemId,
                    );
                    const vendorId = String(values.get("vendor_id") || "");
                    const vendor = data.vendors.find(
                      (row) => String(row.vendor_id) === vendorId,
                    );
                    const quantity = Number(values.get("quantity") || 1);
                    const unitCost = Number(values.get("unit_cost") || 0);
                    const amount = Number(
                      values.get("amount") || quantity * unitCost,
                    );

                    const quoteDrafts = [1, 2, 3]
                      .map((index) => {
                        const quoteVendorId = String(
                          values.get(`quote_vendor_${index}`) || "",
                        );
                        const quoteUnitCost = Number(
                          values.get(`quote_cost_${index}`) || 0,
                        );

                        return {
                          vendorId: quoteVendorId,
                          unitCost: quoteUnitCost,
                          totalCost: quoteUnitCost * quantity,
                          note: String(
                            values.get(`quote_note_${index}`) || "",
                          ),
                        };
                      })
                      .filter(
                        (quote) => quote.vendorId && quote.unitCost > 0,
                      );

                    return {
                      nest_id: values.get("nest_id"),
                      item_id: itemId || null,
                      item_code: item?.item_code || values.get("item_code"),
                      description:
                        values.get("description") || item?.item_name || "",
                      vendor_id: vendorId || null,
                      vendor_name:
                        vendor?.vendor_name || values.get("vendor_name") || "",
                      department: values.get("department"),
                      team: values.get("team"),
                      gl_code: values.get("gl_code") || item?.gl_code || "",
                      category: values.get("category") || item?.category || "",
                      expense_type:
                        values.get("expense_type") || item?.expense_type || "",
                      summary_group:
                        values.get("summary_group") ||
                        item?.summary_group ||
                        "",
                      unit: values.get("unit") || item?.unit_measure || "",
                      quantity,
                      unit_cost: unitCost,
                      actual_amount: amount,
                      amount,
                      blanket_po: values.get("blanket_po"),
                      comment: values.get("comment"),
                      quotes: quoteDrafts,
                    };
                  },
                  "Expense activity recorded.",
                )}
              >
                <Field label="Nest">
                  <select
                    className={selectClass}
                    name="nest_id"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a nest
                    </option>
                    {data.nests.map((nest, index) => {
                      const nestId = getNestId(nest);
                      if (nestId === null) return null;
                      if (
                        !canManage &&
                        !canRecordNestIds.includes(String(nestId))
                      ) {
                        return null;
                      }

                      return (
                        <option
                          key={`expense-nest-${String(nestId)}-${index}`}
                          value={String(nestId)}
                        >
                          {getNestLabel(nest)}
                        </option>
                      );
                    })}
                  </select>
                </Field>

                <Field
                  label="Catalog item"
                  hint="Choose the country catalog item for this expense."
                >
                  <select
                    className={selectClass}
                    name="item_id"
                    defaultValue=""
                    required
                  >
                    <option value="">Choose an item</option>
                    {data.items.map((item, index) => (
                      <option
                        key={`item-${String(item.item_id ?? "unknown")}-${index}`}
                        value={item.item_id}
                      >
                        {item.item_code ? `${item.item_code} · ` : ""}
                        {item.item_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Vendor">
                  <select
                    className={selectClass}
                    name="vendor_id"
                    defaultValue=""
                    required
                  >
                    <option value="">Select a vendor from this country</option>
                    {data.vendors.map((vendor, index) => (
                      <option
                        key={`vendor-${String(vendor.vendor_id ?? "unknown")}-${index}`}
                        value={vendor.vendor_id}
                      >
                        {vendor.vendor_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Vendor not listed?">
                  <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-5 text-slate-600">
                    Add the vendor in Country catalogs, then select it here.
                  </div>
                </Field>

                <Field label="Activity / description">
                  <input
                    className={inputClass}
                    name="description"
                    placeholder="What is being done or purchased?"
                    required
                  />
                </Field>

                <Field label="Department">
                  <input
                    className={inputClass}
                    name="department"
                    placeholder="Facilities, Operations…"
                  />
                </Field>

                <Field label="Team">
                  <input
                    className={inputClass}
                    name="team"
                    placeholder="Team or cost centre"
                  />
                </Field>

                <Field label="GL code">
                  <select
                    className={selectClass}
                    name="gl_code"
                    defaultValue=""
                  >
                    <option value="">Select GL code</option>
                    {data.glCodes.map((code, index) => (
                      <option
                        key={`gl-code-${String(code.gl_code ?? "unknown")}-${index}`}
                        value={code.gl_code}
                      >
                        {code.gl_code} · {code.description}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Category">
                  <input
                    className={inputClass}
                    name="category"
                    placeholder="Fuel, travel, facilities…"
                  />
                </Field>

                <Field label="Summary group">
                  <input
                    className={inputClass}
                    name="summary_group"
                    placeholder="COGS, OPEX, Capex…"
                  />
                </Field>

                <Field label="Expense type">
                  <select
                    className={selectClass}
                    name="expense_type"
                    defaultValue=""
                  >
                    <option value="">Select type</option>
                    <option value="recurring">Recurring</option>
                    <option value="one_off">One-off</option>
                    <option value="discretionary">Discretionary</option>
                    <option value="non_discretionary">
                      Non-discretionary
                    </option>
                  </select>
                </Field>

                <Field label="Unit">
                  <input
                    className={inputClass}
                    name="unit"
                    placeholder="Each, litre, day…"
                  />
                </Field>

                <Field label="Quantity">
                  <input
                    className={inputClass}
                    name="quantity"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="1"
                  />
                </Field>

                <Field label="Unit cost">
                  <input
                    className={inputClass}
                    name="unit_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </Field>

                <Field
                  label="Total amount"
                  hint={`Currency: ${currency || "quarter currency"}`}
                >
                  <input
                    className={inputClass}
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter total, or leave blank to use quantity × unit cost"
                  />
                </Field>

                <Field label="Blanket PO">
                  <input
                    className={inputClass}
                    name="blanket_po"
                    placeholder="Optional PO reference"
                  />
                </Field>

                <Field
                  label="Comment"
                  className="sm:col-span-2 xl:col-span-3"
                >
                  <textarea
                    className={`${inputClass} min-h-24 resize-y`}
                    name="comment"
                    placeholder="Add context for Finance and reviewers"
                  />
                </Field>

                <div className="sm:col-span-2 xl:col-span-3">
                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer text-sm font-bold text-slate-800">
                      Add alternative vendor quotes
                    </summary>
                    <p className="mt-1 text-xs text-slate-500">
                      Enter up to three alternatives for comparison.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[1, 2, 3].map((index) => (
                        <div
                          key={index}
                          className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Quote {index}
                          </p>
                          <select
                            className={selectClass}
                            name={`quote_vendor_${index}`}
                            defaultValue=""
                          >
                            <option value="">Choose vendor</option>
                            {data.vendors.map((vendor, vendorIndex) => (
                              <option
                                key={`quote-vendor-${String(vendor.vendor_id ?? "unknown")}-${vendorIndex}`}
                                value={String(vendor.vendor_id ?? "")}
                              >
                                {vendor.vendor_name}
                              </option>
                            ))}
                          </select>
                          <input
                            className={inputClass}
                            name={`quote_cost_${index}`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit cost"
                          />
                          <input
                            className={inputClass}
                            name={`quote_note_${index}`}
                            placeholder="Note"
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-violet-50 p-4 sm:col-span-2 xl:col-span-3">
                  <div>
                    <p className="text-sm font-bold text-violet-950">
                      Balance preview
                    </p>
                    <p className="mt-1 text-xs leading-5 text-violet-800">
                      Nest allocation is shown on the Overview tab. This entry
                      is saved against the selected nest and quarter.
                    </p>
                  </div>
                  <button className={buttonPrimary} disabled={saving}>
                    {saving ? "Saving…" : "Save activity"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              eyebrow="Quarter ledger"
              title="Recorded activities"
              description="Finance and country managers can review entries and record actual amounts."
            />

            {cycleEntries.length ? (
              <TableWrap>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Nest</Th>
                      <Th>Activity</Th>
                      <Th>Vendor</Th>
                      <Th>GL / Category</Th>
                      <Th>Amount</Th>
                      <Th>Status</Th>
                      <Th>Review</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleEntries.map((entry, index) => (
                      <tr key={`expense-entry-${String(entry.entry_id ?? "unknown")}-${index}`}>
                        <Td className="font-semibold text-slate-900">
                          {nestName(entry.nest_id)}
                        </Td>
                        <Td>
                          <p className="font-semibold text-slate-900">
                            {text(entry.description)}
                          </p>
                          {entry.comment && (
                            <p className="mt-1 max-w-xs text-xs text-slate-500">
                              {entry.comment}
                            </p>
                          )}
                        </Td>
                        <Td>{text(entry.vendor_name)}</Td>
                        <Td>
                          <p>{text(entry.gl_code)}</p>
                          <p className="text-xs text-slate-500">
                            {text(entry.summary_group || entry.category)}
                          </p>
                        </Td>
                        <Td className="font-bold text-slate-900">
                          {money(
                            entry.actual_amount ??
                              entry.amount ??
                              entry.total_cost,
                            currency,
                          )}
                        </Td>
                        <Td>
                          <StatusPill status={entry.status} />
                        </Td>
                        <Td>
                          {canManage && (
                            <div className="flex min-w-52 flex-col gap-2">
                              <input
                                className={inputClass}
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Actual amount"
                                defaultValue={entry.actual_amount ?? ""}
                                id={`actual-${entry.entry_id}`}
                              />
                              <input
                                className={inputClass}
                                placeholder="Review note"
                                defaultValue={entry.review_note ?? ""}
                                id={`review-note-${entry.entry_id}`}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                                  disabled={saving}
                                  onClick={() =>
                                    void submitAction("review_expense", {
                                      entry_id: entry.entry_id,
                                      status: "approved",
                                      actual_amount:
                                        (
                                          document.getElementById(
                                            `actual-${entry.entry_id}`,
                                          ) as HTMLInputElement
                                        )?.value || null,
                                      review_note: (
                                        document.getElementById(
                                          `review-note-${entry.entry_id}`,
                                        ) as HTMLInputElement
                                      )?.value,
                                    })
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
                                  disabled={saving}
                                  onClick={() =>
                                    void submitAction("review_expense", {
                                      entry_id: entry.entry_id,
                                      status: "rejected",
                                      review_note: (
                                        document.getElementById(
                                          `review-note-${entry.entry_id}`,
                                        ) as HTMLInputElement
                                      )?.value,
                                    })
                                  }
                                >
                                  Return
                                </button>
                              </div>
                            </div>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <EmptyState>
                No activities have been entered for this quarter yet.
              </EmptyState>
            )}
          </section>
        </div>
      )}

      {activeTab === "budgets" && (
        <div className="space-y-6">
          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Detailed plan"
                title="Add a budget line"
                description="Capture the sheet’s planning details by scope, department, GL code, category, quantity, and blanket PO."
              />

              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                onSubmit={handleForm(
                  "save_budget_line",
                  (form) => {
                    const values = new FormData(form);

                    return {
                      scope_type: values.get("scope_type"),
                      scope_label: values.get("scope_label"),
                      nest_id: values.get("nest_id") || null,
                      department: values.get("department"),
                      team: values.get("team"),
                      gl_code: values.get("gl_code"),
                      category: values.get("category"),
                      summary_group: values.get("summary_group"),
                      budget_amount: Number(
                        values.get("budget_amount") || 0,
                      ),
                      blanket_po: values.get("blanket_po"),
                      qty: Number(values.get("qty") || 0),
                      unit: values.get("unit"),
                      cost: Number(values.get("cost") || 0),
                      notes: values.get("notes"),
                    };
                  },
                  "Budget line saved.",
                )}
              >
                <Field label="Scope">
                  <select
                    className={selectClass}
                    name="scope_type"
                    defaultValue="nest"
                  >
                    <option value="nest">Nest</option>
                    <option value="country">Country</option>
                    <option value="department">Department</option>
                  </select>
                </Field>

                <Field label="Scope label">
                  <input
                    className={inputClass}
                    name="scope_label"
                    placeholder="e.g. Nairobi Nest"
                  />
                </Field>

                <Field label="Nest">
                  <select
                    className={selectClass}
                    name="nest_id"
                    defaultValue=""
                  >
                    <option value="">No specific nest</option>
                    {data.nests.map((nest, index) => {
                      const nestId = getNestId(nest);
                      if (nestId === null) return null;

                      return (
                        <option
                          key={`budget-nest-${String(nestId)}-${index}`}
                          value={String(nestId)}
                        >
                          {getNestLabel(nest)}
                        </option>
                      );
                    })}
                  </select>
                </Field>

                <Field label="Department">
                  <input
                    className={inputClass}
                    name="department"
                    placeholder="Facilities, Operations…"
                  />
                </Field>

                <Field label="Team">
                  <input
                    className={inputClass}
                    name="team"
                    placeholder="Team or cost centre"
                  />
                </Field>

                <Field label="GL code">
                  <select
                    className={selectClass}
                    name="gl_code"
                    defaultValue=""
                  >
                    <option value="">Select GL code</option>
                    {data.glCodes.map((code, index) => (
                      <option
                        key={`gl-code-${String(code.gl_code ?? "unknown")}-${index}`}
                        value={code.gl_code}
                      >
                        {code.gl_code} · {code.description}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Category">
                  <input
                    className={inputClass}
                    name="category"
                    placeholder="Category"
                  />
                </Field>

                <Field label="Summary group">
                  <input
                    className={inputClass}
                    name="summary_group"
                    placeholder="COGS, OPEX, Capex…"
                  />
                </Field>

                <Field label="Budget amount">
                  <input
                    className={inputClass}
                    name="budget_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </Field>

                <Field label="Blanket PO">
                  <input
                    className={inputClass}
                    name="blanket_po"
                    placeholder="Optional PO reference"
                  />
                </Field>

                <Field label="Quantity">
                  <input
                    className={inputClass}
                    name="qty"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Unit">
                  <input
                    className={inputClass}
                    name="unit"
                    placeholder="Each, litre, month…"
                  />
                </Field>

                <Field label="Unit cost">
                  <input
                    className={inputClass}
                    name="cost"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Notes" className="sm:col-span-2 xl:col-span-3">
                  <textarea
                    className={`${inputClass} min-h-20`}
                    name="notes"
                    placeholder="Planning notes"
                  />
                </Field>

                <div className="sm:col-span-2 xl:col-span-3">
                  <button
                    className={buttonPrimary}
                    disabled={saving || !selectedCycle}
                  >
                    Save budget line
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              eyebrow="Budget tracking"
              title="Budget versus recorded expenses"
              description="Variance is budget amount minus matching expense entries, grouped by GL code or summary group."
            />

            {budgetVarianceRows.length ? (
              <TableWrap>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Scope</Th>
                      <Th>Department / Team</Th>
                      <Th>GL / Category</Th>
                      <Th>Budget</Th>
                      <Th>Recorded</Th>
                      <Th>Variance</Th>
                      <Th>Blanket PO</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetVarianceRows.map((line, index) => (
                      <tr key={`budget-line-${String(line.budget_id ?? "unknown")}-${index}`}>
                        <Td className="font-semibold text-slate-900">
                          {text(
                            line.scope_label ||
                              (line.nest_id
                                ? nestName(line.nest_id)
                                : line.scope_type),
                          )}
                        </Td>
                        <Td>
                          {text(line.department)}
                          <p className="text-xs text-slate-500">
                            {text(line.team)}
                          </p>
                        </Td>
                        <Td>
                          {text(line.gl_code)}
                          <p className="text-xs text-slate-500">
                            {text(line.summary_group || line.category)}
                          </p>
                        </Td>
                        <Td>{money(line.budget_amount, currency)}</Td>
                        <Td>{money(line.spent, currency)}</Td>
                        <Td
                          className={
                            line.variance < 0
                              ? "font-bold text-rose-700"
                              : "font-bold text-emerald-700"
                          }
                        >
                          {money(line.variance, currency)}
                        </Td>
                        <Td>{text(line.blanket_po)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <EmptyState>
                No detailed budget lines have been entered for this quarter.
              </EmptyState>
            )}
          </section>
        </div>
      )}

      {activeTab === "fuel" && (
        <div className="space-y-6">
          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Fuel register"
                title="Add a vehicle or generator"
                description="Maintain country fuel assets for vehicle, generator, and fuel card planning."
              />

              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                onSubmit={handleForm(
                  "add_fuel_asset",
                  (form) => {
                    const values = new FormData(form);

                    return {
                      asset_name: values.get("asset_name"),
                      asset_type: values.get("asset_type"),
                      nest_id: values.get("nest_id") || null,
                      license_plate: values.get("license_plate"),
                      purpose: values.get("purpose"),
                      status: values.get("status"),
                    };
                  },
                  "Fuel asset added.",
                )}
              >
                <Field label="Asset name">
                  <input
                    className={inputClass}
                    name="asset_name"
                    placeholder="Vehicle or generator name"
                    required
                  />
                </Field>

                <Field label="Asset type">
                  <select
                    className={selectClass}
                    name="asset_type"
                    defaultValue="vehicle"
                  >
                    <option value="vehicle">Vehicle</option>
                    <option value="generator">Generator</option>
                    <option value="fuel_card">Fuel card</option>
                  </select>
                </Field>

                <Field label="Nest">
                  <select
                    className={selectClass}
                    name="nest_id"
                    defaultValue=""
                  >
                    <option value="">Country-wide / unassigned</option>
                    {data.nests.map((nest, index) => {
                      const nestId = getNestId(nest);
                      if (nestId === null) return null;

                      return (
                        <option
                          key={`fuel-nest-${String(nestId)}-${index}`}
                          value={String(nestId)}
                        >
                          {getNestLabel(nest)}
                        </option>
                      );
                    })}
                  </select>
                </Field>

                <Field label="License plate / identifier">
                  <input
                    className={inputClass}
                    name="license_plate"
                    placeholder="Plate number or asset ID"
                  />
                </Field>

                <Field label="Purpose">
                  <input
                    className={inputClass}
                    name="purpose"
                    placeholder="Operational purpose"
                  />
                </Field>

                <Field label="Status">
                  <select
                    className={selectClass}
                    name="status"
                    defaultValue="active"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </Field>

                <div className="sm:col-span-2 xl:col-span-3">
                  <button
                    className={buttonPrimary}
                    disabled={saving || !selectedCycle}
                  >
                    Add fuel asset
                  </button>
                </div>
              </form>
            </section>
          )}

          {canManage && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Quarter fuel plan"
                title="Set fuel assumptions"
                description="Estimate fuel by litres, price per litre, and monthly activity."
              />

              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                onSubmit={handleForm(
                  "save_fuel_plan",
                  (form) => {
                    const values = new FormData(form);

                    return {
                      asset_id: values.get("asset_id"),
                      vendor_id: values.get("vendor_id") || null,
                      vendor_name: values.get("vendor_name"),
                      litres_per_100km: Number(
                        values.get("litres_per_100km") || 0,
                      ),
                      litres_per_hour: Number(
                        values.get("litres_per_hour") || 0,
                      ),
                      cost_per_litre: Number(
                        values.get("cost_per_litre") || 0,
                      ),
                      monthly_km: Number(values.get("monthly_km") || 0),
                      monthly_hours: Number(
                        values.get("monthly_hours") || 0,
                      ),
                      monthly_litres: Number(
                        values.get("monthly_litres") || 0,
                      ),
                      quarterly_litres: Number(
                        values.get("quarterly_litres") || 0,
                      ),
                      quarterly_cost: Number(
                        values.get("quarterly_cost") || 0,
                      ),
                      notes: values.get("notes"),
                    };
                  },
                  "Fuel plan saved.",
                )}
              >
                <Field label="Vehicle / generator">
                  <select
                    className={selectClass}
                    name="asset_id"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select an asset
                    </option>
                    {data.fuelAssets.map((asset, index) => (
                      <option
                        key={`fuel-asset-${String(asset.asset_id ?? "unknown")}-${index}`}
                        value={asset.asset_id}
                      >
                        {asset.asset_name || asset.name}
                        {asset.license_plate
                          ? ` · ${asset.license_plate}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Fuel vendor">
                  <select
                    className={selectClass}
                    name="vendor_id"
                    defaultValue=""
                  >
                    <option value="">Select vendor</option>
                    {data.vendors.map((vendor, index) => (
                      <option
                        key={`vendor-${String(vendor.vendor_id ?? "unknown")}-${index}`}
                        value={vendor.vendor_id}
                      >
                        {vendor.vendor_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Vendor name">
                  <input
                    className={inputClass}
                    name="vendor_name"
                    placeholder="Optional vendor"
                  />
                </Field>

                <Field label="Litres per 100 km">
                  <input
                    className={inputClass}
                    name="litres_per_100km"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Litres per hour">
                  <input
                    className={inputClass}
                    name="litres_per_hour"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Cost per litre">
                  <input
                    className={inputClass}
                    name="cost_per_litre"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Monthly kilometres">
                  <input
                    className={inputClass}
                    name="monthly_km"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Monthly generator hours">
                  <input
                    className={inputClass}
                    name="monthly_hours"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Monthly litres">
                  <input
                    className={inputClass}
                    name="monthly_litres"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Quarter litres">
                  <input
                    className={inputClass}
                    name="quarterly_litres"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Quarter cost">
                  <input
                    className={inputClass}
                    name="quarterly_cost"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Notes">
                  <input
                    className={inputClass}
                    name="notes"
                    placeholder="Fuel assumptions or context"
                  />
                </Field>

                <div className="sm:col-span-2 xl:col-span-3">
                  <button
                    className={buttonPrimary}
                    disabled={saving || !selectedCycle}
                  >
                    Save fuel plan
                  </button>
                </div>
              </form>
            </section>
          )}

          {data.fuelPlans.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeading
                eyebrow="Fuel actuals"
                title="Record quarterly fuel actuals"
                description="Use this after the quarter’s fuel activity is known to compare actual litres and cost with the plan."
              />

              <div className="space-y-3">
                {data.fuelPlans.map((plan, index) => (
                  <form
                    key={`fuel-plan-${String(
                      plan.fuel_plan_id ?? plan.plan_id ?? "unknown",
                    )}-${index}`}
                    className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-5"
                    onSubmit={handleForm(
                      "record_fuel_actual",
                      (form) => {
                        const values = new FormData(form);

                        return {
                          fuel_plan_id:
                            plan.fuel_plan_id || plan.plan_id,
                          actual_monthly_activity: Number(
                            values.get("actual_monthly_activity") || 0,
                          ),
                          actual_quarterly_litres: Number(
                            values.get("actual_quarterly_litres") || 0,
                          ),
                          actual_quarterly_cost: Number(
                            values.get("actual_quarterly_cost") || 0,
                          ),
                          actual_notes: values.get("actual_notes"),
                        };
                      },
                      "Fuel actuals recorded.",
                    )}
                  >
                    <div className="xl:col-span-2">
                      <p className="font-bold text-slate-900">
                        {text(
                          plan.asset_name ||
                            plan.name ||
                            plan.license_plate,
                          "Fuel asset",
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Plan: {money(plan.quarterly_cost, currency)} ·{" "}
                        {numberValue(plan.quarterly_litres)} litres
                      </p>
                    </div>

                    <Field label="Actual activity">
                      <input
                        className={inputClass}
                        name="actual_monthly_activity"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={plan.actual_monthly_activity ?? ""}
                      />
                    </Field>

                    <Field label="Actual quarter litres">
                      <input
                        className={inputClass}
                        name="actual_quarterly_litres"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={plan.actual_quarterly_litres ?? ""}
                      />
                    </Field>

                    <Field label="Actual quarter cost">
                      <input
                        className={inputClass}
                        name="actual_quarterly_cost"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={plan.actual_quarterly_cost ?? ""}
                      />
                    </Field>

                    <Field
                      label="Actual notes"
                      className="sm:col-span-2 xl:col-span-4"
                    >
                      <input
                        className={inputClass}
                        name="actual_notes"
                        defaultValue={plan.actual_notes ?? ""}
                        placeholder="Notes"
                      />
                    </Field>

                    <div className="flex items-end">
                      <button className={buttonPrimary} disabled={saving}>
                        Save actuals
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeading
              eyebrow="Country assets"
              title="Fuel assets"
              description="Vehicles, generators, and fuel cards configured for this country."
            />

            {data.fuelAssets.length ? (
              <TableWrap>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Asset</Th>
                      <Th>Type</Th>
                      <Th>Nest</Th>
                      <Th>Identifier</Th>
                      <Th>Purpose</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fuelAssets.map((asset, index) => (
                      <tr key={`fuel-asset-${String(asset.asset_id ?? "unknown")}-${index}`}>
                        <Td className="font-semibold text-slate-900">
                          {text(asset.asset_name || asset.name)}
                        </Td>
                        <Td>{text(asset.asset_type)}</Td>
                        <Td>
                          {asset.nest_id
                            ? nestName(asset.nest_id)
                            : "Country-wide"}
                        </Td>
                        <Td>{text(asset.license_plate)}</Td>
                        <Td>{text(asset.purpose)}</Td>
                        <Td>
                          <StatusPill status={asset.status} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <EmptyState>
                No fuel assets have been added for this country.
              </EmptyState>
            )}
          </section>
        </div>
      )}

      {activeTab === "catalog" && (
        <div className="grid gap-6 xl:grid-cols-3">
          {canManage && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeading
                  eyebrow="Country catalog"
                  title="Add vendor"
                  description="Vendors are selectable by users working in this country."
                />

                <form
                  className="space-y-3"
                  onSubmit={handleForm(
                    "add_vendor",
                    (form) => {
                      const values = new FormData(form);

                      return {
                        vendor_name: values.get("vendor_name"),
                        vendor_code: values.get("vendor_code"),
                        contact_name: values.get("contact_name"),
                        phone: values.get("phone"),
                        email: values.get("email"),
                        notes: values.get("notes"),
                      };
                    },
                    "Vendor added to the country list.",
                  )}
                >
                  <Field label="Vendor name">
                    <input
                      className={inputClass}
                      name="vendor_name"
                      required
                    />
                  </Field>

                  <Field label="Vendor code">
                    <input className={inputClass} name="vendor_code" />
                  </Field>

                  <Field label="Contact name">
                    <input className={inputClass} name="contact_name" />
                  </Field>

                  <Field label="Phone">
                    <input className={inputClass} name="phone" />
                  </Field>

                  <Field label="Email">
                    <input
                      className={inputClass}
                      name="email"
                      type="email"
                    />
                  </Field>

                  <Field label="Notes">
                    <textarea
                      className={`${inputClass} min-h-20`}
                      name="notes"
                    />
                  </Field>

                  <button className={buttonPrimary} disabled={saving}>
                    Add vendor
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeading
                  eyebrow="Country catalog"
                  title="Add item"
                  description="Store country-specific items, codes, units, and summary group."
                />

                <form
                  className="space-y-3"
                  onSubmit={handleForm(
                    "add_item",
                    (form) => {
                      const values = new FormData(form);

                      return {
                        item_code: values.get("item_code"),
                        item_name: values.get("item_name"),
                        category: values.get("category"),
                        department: values.get("department"),
                        gl_code: values.get("gl_code"),
                        expense_type: values.get("expense_type"),
                        unit_measure: values.get("unit_measure"),
                        summary_group: values.get("summary_group"),
                      };
                    },
                    "Item added to the country catalog.",
                  )}
                >
                  <Field label="Item code">
                    <input className={inputClass} name="item_code" />
                  </Field>

                  <Field label="Item name">
                    <input
                      className={inputClass}
                      name="item_name"
                      required
                    />
                  </Field>

                  <Field label="Category">
                    <input className={inputClass} name="category" />
                  </Field>

                  <Field label="Department">
                    <input className={inputClass} name="department" />
                  </Field>

                  <Field label="GL code">
                    <select
                      className={selectClass}
                      name="gl_code"
                      defaultValue=""
                    >
                      <option value="">Select GL code</option>
                      {data.glCodes.map((code, index) => (
                        <option
                          key={`gl-code-${String(code.gl_code ?? "unknown")}-${index}`}
                          value={code.gl_code}
                        >
                          {code.gl_code} · {code.description}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Expense type">
                    <select
                      className={selectClass}
                      name="expense_type"
                      defaultValue=""
                    >
                      <option value="">Select type</option>
                      <option value="recurring">Recurring</option>
                      <option value="one_off">One-off</option>
                      <option value="discretionary">Discretionary</option>
                      <option value="non_discretionary">
                        Non-discretionary
                      </option>
                    </select>
                  </Field>

                  <Field label="Unit of measure">
                    <input
                      className={inputClass}
                      name="unit_measure"
                      placeholder="Each, litre, day…"
                    />
                  </Field>

                  <Field label="Summary group">
                    <input
                      className={inputClass}
                      name="summary_group"
                      placeholder="COGS, OPEX, Capex…"
                    />
                  </Field>

                  <button className={buttonPrimary} disabled={saving}>
                    Add item
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeading
                  eyebrow="Country catalog"
                  title="Add GL code"
                  description="Finance can use GL codes to organise budget and expense analysis."
                />

                <form
                  className="space-y-3"
                  onSubmit={handleForm(
                    "add_gl_code",
                    (form) => {
                      const values = new FormData(form);

                      return {
                        gl_code: values.get("gl_code"),
                        description: values.get("description"),
                        category: values.get("category"),
                        summary_group: values.get("summary_group"),
                      };
                    },
                    "GL code added.",
                  )}
                >
                  <Field label="GL code">
                    <input
                      className={inputClass}
                      name="gl_code"
                      required
                    />
                  </Field>

                  <Field label="Description">
                    <input
                      className={inputClass}
                      name="description"
                      required
                    />
                  </Field>

                  <Field label="Category">
                    <input className={inputClass} name="category" />
                  </Field>

                  <Field label="Summary group">
                    <input
                      className={inputClass}
                      name="summary_group"
                    />
                  </Field>

                  <button className={buttonPrimary} disabled={saving}>
                    Add GL code
                  </button>
                </form>
              </section>
            </>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
            <SectionHeading
              eyebrow="Available choices"
              title="Country vendors, items, and GL codes"
              description="These lists are available in the expense entry forms for the selected country."
            />

            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  Vendors
                </h3>

                {data.vendors.length ? (
                  <ul className="space-y-2">
                    {data.vendors.map((vendor, index) => (
                      <li
                        key={`vendor-${String(vendor.vendor_id ?? "unknown")}-${index}`}
                        className="rounded-xl border border-slate-200 px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {vendor.vendor_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {text(vendor.vendor_code, "No vendor code")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No vendors have been added.</EmptyState>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  Items
                </h3>

                {data.items.length ? (
                  <ul className="space-y-2">
                    {data.items.map((item, index) => (
                      <li
                        key={`item-${String(item.item_id ?? "unknown")}-${index}`}
                        className="rounded-xl border border-slate-200 px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {item.item_code ? `${item.item_code} · ` : ""}
                          {item.item_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[
                            item.category,
                            item.gl_code,
                            item.unit_measure,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No category details"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No items have been added.</EmptyState>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  GL codes
                </h3>

                {data.glCodes.length ? (
                  <ul className="space-y-2">
                    {data.glCodes.map((code, index) => (
                      <li
                        key={`gl-code-${String(code.gl_code ?? "unknown")}-${index}`}
                        className="rounded-xl border border-slate-200 px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {code.gl_code}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {text(code.description)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>No GL codes have been added.</EmptyState>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {isFinance && activeTab !== "overview" && (
        <p className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
          Finance view: use the country and quarter selectors to review data.
          Updates to allocations, catalogs, and fuel plans are available to
          users whose account has country management permission.
        </p>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        Amounts are shown in the selected quarter’s currency. USD comparisons use
        the stored exchange rate. Confirm the exchange rate and source values
        before using the comparisons for financial reporting.
      </footer>
    </main>
  );
}