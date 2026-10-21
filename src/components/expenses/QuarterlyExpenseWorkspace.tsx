"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type Cycle = {
  cycle_id: string;
  country: string;
  fiscal_year: number;
  quarter: number;
  currency_code: string;
  fx_rate_to_usd: number | string | null;
  status: string;
};

type Nest = { id: string; code: string; name: string };
type Item = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string;
};
type Vendor = { vendor_id: string; vendor_name: string };
type Allocation = {
  allocation_id: string;
  nest_id: number;
  allocation_amount: number | string;
};
type Entry = {
  expense_id: string;
  cycle_id: string;
  nest_id: number;
  item_code_snapshot: string;
  item_name_snapshot: string;
  vendor_name_snapshot: string;
  amount: number | string;
  actual_amount: number | string | null;
  status: string;
  department: string | null;
  gl_code: string | null;
  category: string | null;
  expense_type: string | null;
  description: string | null;
  unit_measure: string | null;
  quantity: number | string | null;
  unit_cost: number | string | null;
  comment: string | null;
  created_at: string;
};
type FuelAsset = {
  asset_id: string;
  nest_id: number | null;
  asset_type: string;
  identifier: string;
  model: string | null;
  purpose: string | null;
  fuel_type: string | null;
  vendor_name: string | null;
  consumption_rate: number | string | null;
  consumption_basis: string | null;
};
type FuelPlan = {
  fuel_plan_id: string;
  asset_id: string;
  nest_id: number;
  estimated_quarterly_litres: number | string;
  estimated_quarterly_cost: number | string;
};
type Quote = {
  quote_id: string;
  expense_id: string;
  vendor_name_snapshot: string;
  unit_cost: number | string;
  total_cost: number | string;
  note: string | null;
  is_selected: boolean;
};
type BudgetLine = {
  budget_id: string;
  nest_id: number | null;
  scope_type: string;
  scope_label: string | null;
  department: string | null;
  gl_code: string | null;
  category: string | null;
  budget_amount: number | string;
  notes: string | null;
};
type CountryComparison = {
  country: string;
  currencyCode: string;
  allocated: number;
  committed: number;
  remaining: number;
  allocatedUsd: number | null;
  committedUsd: number | null;
  remainingUsd: number | null;
  fxRateToUsd: number | null;
};

type DashboardData = {
  countries: string[];
  country: string;
  currencyCode: string;
  nests: Nest[];
  cycles: Cycle[];
  selectedCycle: Cycle | null;
  allocations: Allocation[];
  budgetLines: BudgetLine[];
  entries: Entry[];
  historyEntries: Entry[];
  items: Item[];
  vendors: Vendor[];
  fuelAssets: FuelAsset[];
  fuelPlans: FuelPlan[];
  quotes: Quote[];
  countryComparison: CountryComparison[];
  permissions: {
    canManageCountry: boolean;
    canRecordNestIds: string[];
  };
};

type QuoteDraft = { vendorId: string; unitCost: string; totalCost: string; note: string };

const empty: DashboardData = {
  countries: [],
  country: "",
  currencyCode: "USD",
  nests: [],
  cycles: [],
  selectedCycle: null,
  allocations: [],
  budgetLines: [],
  entries: [],
  historyEntries: [],
  items: [],
  vendors: [],
  fuelAssets: [],
  fuelPlans: [],
  quotes: [],
  countryComparison: [],
  permissions: { canManageCountry: false, canRecordNestIds: [] },
};

const input =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:bg-slate-100";
const select =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:bg-slate-100";
const label = "block text-sm font-bold text-slate-800";
const button =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-600/20 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50";

function num(value: number | string | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function cash(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function cycleName(cycle: Cycle) {
  return `Q${cycle.quarter} ${cycle.fiscal_year}`;
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCounted(entry: Entry) {
  return !["rejected"].includes(entry.status);
}

export function QuarterlyExpenseWorkspace({
  mode = "planning",
}: {
  mode?: "planning" | "finance";
}) {
  const [data, setData] = useState<DashboardData>(empty);
  const [country, setCountry] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [tab, setTab] = useState<"overview" | "budget" | "fuel" | "catalog">("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNestId, setExpenseNestId] = useState("");
  const [quotes, setQuotes] = useState<QuoteDraft[]>([]);

  async function load(nextCountry = country, nextCycle = cycleId) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextCountry) params.set("country", nextCountry);
      if (nextCycle) params.set("cycleId", nextCycle);
      const response = await fetch(`/api/expenses/quarterly?${params}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load expenses.");
      const next = result as DashboardData;
      setData(next);
      setCountry(next.country);
      setCycleId(next.selectedCycle?.cycle_id ?? "");
      setExpenseNestId((current) =>
        next.permissions.canRecordNestIds.includes(current)
          ? current
          : next.permissions.canRecordNestIds[0] ?? "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("", "");
    // Load the initial view once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycle = data.selectedCycle;
  const manager = data.permissions.canManageCountry;
  const recordNests = data.permissions.canRecordNestIds;
  const selectedNest = data.nests.find((nest) => nest.id === expenseNestId);

  const allocations = useMemo(
    () =>
      new Map(
        data.allocations.map((row) => [
          Number(row.nest_id),
          num(row.allocation_amount),
        ]),
      ),
    [data.allocations],
  );

  const committedByNest = useMemo(() => {
    const totals = new Map<number, number>();
    for (const entry of data.entries) {
      if (!isCounted(entry)) continue;
      const amount =
        entry.status === "actual" && entry.actual_amount != null
          ? num(entry.actual_amount)
          : num(entry.amount);
      totals.set(entry.nest_id, (totals.get(entry.nest_id) ?? 0) + amount);
    }
    for (const plan of data.fuelPlans) {
      totals.set(
        Number(plan.nest_id),
        (totals.get(Number(plan.nest_id)) ?? 0) +
          num(plan.estimated_quarterly_cost),
      );
    }
    return totals;
  }, [data.entries, data.fuelPlans]);

  const totalAllocation = data.allocations.reduce(
    (sum, row) => sum + num(row.allocation_amount),
    0,
  );
  const totalCommitted = [...committedByNest.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalRemaining = totalAllocation - totalCommitted;
  const enteredAmount = num(expenseAmount);
  const selectedAllocated = allocations.get(Number(expenseNestId)) ?? 0;
  const selectedCommitted = committedByNest.get(Number(expenseNestId)) ?? 0;
  const previewRemaining = selectedAllocated - selectedCommitted - enteredAmount;

  async function post(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/expenses/quarterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save.");
      await load(country, cycleId);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post({
      action: "create_cycle",
      country,
      fiscalYear: form.get("fiscalYear"),
      quarter: form.get("quarter"),
      fxRateToUsd: form.get("fxRateToUsd"),
    }).then((result) => {
      if (result?.cycle?.cycle_id) {
        setNotice("Quarter created. Add nest allocations, then open it.");
        void load(result.cycle.country, result.cycle.cycle_id);
      }
    });
  }

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cycle) return;
    const form = new FormData(event.currentTarget);
    const vendorId = String(form.get("vendorId") ?? "");
    const selectedVendor = data.vendors.find((item) => item.vendor_id === vendorId);
    const unitCost = num(String(form.get("unitCost") ?? ""));
    const amount = num(String(form.get("amount") ?? ""));
    const quoteRows = quotes
      .filter((quote) => quote.vendorId && quote.totalCost)
      .map((quote) => ({
        vendorId: quote.vendorId,
        unitCost: Number(quote.unitCost),
        totalCost: Number(quote.totalCost),
        note: quote.note,
      }));

    void post({
      action: "add_expense",
      cycleId: cycle.cycle_id,
      nestId: expenseNestId,
      itemId: form.get("itemId"),
      vendorId,
      quantity: form.get("quantity"),
      unitCost,
      amount,
      status: form.get("status"),
      department: form.get("department"),
      glCode: form.get("glCode"),
      category: form.get("category"),
      expenseType: form.get("expenseType"),
      description: form.get("description"),
      unitMeasure: form.get("unitMeasure"),
      comment: form.get("comment"),
      quotes: selectedVendor ? quoteRows : [],
    }).then((result) => {
      if (result) {
        setExpenseAmount("");
        setQuotes([]);
        setNotice("Planning line saved. The committed balance has been updated.");
      }
    });
  }

  const quoteGroups = new Map<string, Quote[]>();
  for (const quote of data.quotes) {
    quoteGroups.set(quote.expense_id, [
      ...(quoteGroups.get(quote.expense_id) ?? []),
      quote,
    ]);
  }

  const spendByCategory = new Map<string, number>();
  for (const entry of data.entries) {
    if (!isCounted(entry)) continue;
    const category = entry.category || "Uncategorised";
    spendByCategory.set(
      category,
      (spendByCategory.get(category) ?? 0) +
        (entry.status === "actual" && entry.actual_amount != null
          ? num(entry.actual_amount)
          : num(entry.amount)),
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-100">
              {mode === "finance" ? "Finance analysis" : "Expense planning"}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {mode === "finance" ? "Quarterly expense analysis" : "Nest expense planner"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100">
              Plan and record non-inventory costs, compare vendor quotes, track fuel projections,
              and see each nest’s remaining allocation.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-violet-100">
              Country
              <select
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setCycleId("");
                  void load(event.target.value, "");
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-white/20 bg-white px-3 text-sm font-bold text-slate-950"
              >
                {data.countries.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-violet-100">
              Quarter
              <select
                value={cycleId}
                onChange={(event) => {
                  setCycleId(event.target.value);
                  void load(country, event.target.value);
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-white/20 bg-white px-3 text-sm font-bold text-slate-950"
              >
                <option value="">Select a quarter</option>
                {data.cycles.map((item) => (
                  <option key={item.cycle_id} value={item.cycle_id}>
                    Q{item.quarter} {item.fiscal_year} · {labelize(item.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {cycle && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/15 pt-5">
            <span className="font-bold">{cycle.country} · {cycleName(cycle)}</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              {labelize(cycle.status)}
            </span>
            <span className="text-sm text-violet-100">
              {data.entries.length} planning and expense lines
            </span>
          </div>
        )}
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}

      {manager && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Quarter setup</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Create a country quarter</h2>
              <p className="mt-1 text-sm text-slate-600">Set the optional conversion rate as USD per one unit of local currency.</p>
            </div>
            <form onSubmit={createCycle} className="grid gap-3 sm:grid-cols-4">
              <label className={label}>Fiscal year<input name="fiscalYear" type="number" min="2020" max="2100" defaultValue={new Date().getFullYear()} className={input} required /></label>
              <label className={label}>Quarter<select name="quarter" className={select}><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></label>
              <label className={label}>USD rate<input name="fxRateToUsd" type="number" min="0" step="0.000001" className={input} placeholder="Optional" /></label>
              <button disabled={saving || !country} className={`${button} self-end`}>Create quarter</button>
            </form>
          </div>
        </section>
      )}

      {!cycle ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">{loading ? "Loading…" : "No quarter selected"}</h2>
          <p className="mt-2 text-sm text-slate-600">{manager ? "Create a quarter above, then allocate funds to nests." : "Ask a country planner to create a quarter for your country."}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              ["Allocated", totalAllocation, "violet"],
              ["Committed", totalCommitted, "blue"],
              ["Remaining", totalRemaining, totalRemaining < 0 ? "rose" : "emerald"],
            ].map(([title, value, color]) => (
              <article key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-600">{title}</p>
                <p className={`mt-2 text-2xl font-extrabold ${color === "rose" ? "text-rose-700" : "text-slate-950"}`}>
                  {cash(Number(value), data.currencyCode)}
                </p>
                <p className="mt-2 text-xs text-slate-500">{cycleName(cycle)} · {country}</p>
              </article>
            ))}
          </section>

          <div className="flex flex-wrap gap-2">
            {(["overview", "budget", "fuel", "catalog"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={tab === value ? "rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white" : "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"}
              >
                {{ overview: "Overview & activity", budget: "Budget lines", fuel: "Fuel planning", catalog: "Items & vendors" }[value]}
              </button>
            ))}
          </div>

          {manager && tab === "overview" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Nest allocations</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Set quarterly spending limits</h2>
                </div>
                {cycle.status === "draft" && (
                  <button
                    className={button}
                    disabled={saving || data.allocations.length === 0}
                    onClick={() => void post({ action: "set_cycle_status", cycleId: cycle.cycle_id, status: "open" })}
                  >Open quarter for entries</button>
                )}
                {cycle.status === "open" && (
                  <button
                    className={secondary}
                    disabled={saving}
                    onClick={() => void post({ action: "set_cycle_status", cycleId: cycle.cycle_id, status: "closed" })}
                  >Close quarter</button>
                )}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Nest</th><th className="p-3">Allocated</th><th className="p-3">Committed</th><th className="p-3">Remaining</th><th className="p-3">Set allocation</th></tr></thead>
                  <tbody>
                    {data.nests.map((nest) => {
                      const id = Number(nest.id);
                      const allocated = allocations.get(id) ?? 0;
                      const committed = committedByNest.get(id) ?? 0;
                      return (
                        <tr key={nest.id} className="border-t border-slate-100">
                          <td className="p-3 font-bold">{nest.code} <span className="font-normal text-slate-500">{nest.name}</span></td>
                          <td className="p-3">{cash(allocated, data.currencyCode)}</td>
                          <td className="p-3">{cash(committed, data.currencyCode)}</td>
                          <td className={`p-3 font-bold ${allocated - committed < 0 ? "text-rose-700" : "text-emerald-700"}`}>{cash(allocated - committed, data.currencyCode)}</td>
                          <td className="p-3">
                            <form onSubmit={(event) => {
                              event.preventDefault();
                              const amount = new FormData(event.currentTarget).get("allocationAmount");
                              void post({ action: "save_allocation", cycleId: cycle.cycle_id, nestId: nest.id, allocationAmount: amount });
                            }} className="flex gap-2">
                              <input name="allocationAmount" type="number" min="0" step="0.01" defaultValue={allocated || ""} className="h-10 w-36 rounded-lg border border-slate-300 px-3 text-slate-950" required />
                              <button className={secondary} disabled={saving || cycle.status === "closed"}>Save</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "overview" && (
            <>
              {recordNests.length > 0 && cycle.status === "open" && (
                <section className="rounded-2xl border border-violet-200 bg-white shadow-sm">
                  <div className="border-b border-violet-100 bg-violet-50/60 p-5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">New planning line</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">Record an activity or purchase</h2>
                    <p className="mt-1 text-sm text-slate-600">Saved planned and in-review lines reduce the available balance immediately.</p>
                  </div>
                  <form onSubmit={submitExpense} className="space-y-5 p-5">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <label className={label}>Nest
                        <select value={expenseNestId} onChange={(event) => setExpenseNestId(event.target.value)} className={select} required>
                          {data.nests.filter((nest) => recordNests.includes(nest.id)).map((nest) => <option key={nest.id} value={nest.id}>{nest.code} · {nest.name}</option>)}
                        </select>
                      </label>
                      <label className={label}>Item and code
                        <select name="itemId" className={select} required>
                          <option value="">Choose item</option>
                          {data.items.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_code} · {item.item_name}</option>)}
                        </select>
                      </label>
                      <label className={label}>Vendor
                        <select name="vendorId" className={select} required>
                          <option value="">Choose country vendor</option>
                          {data.vendors.map((vendor) => <option key={vendor.vendor_id} value={vendor.vendor_id}>{vendor.vendor_name}</option>)}
                        </select>
                      </label>
                      <label className={label}>Department<input name="department" className={input} placeholder="Facilities, Flight, Operations…" /></label>
                      <label className={label}>GL code<input name="glCode" className={input} placeholder="For example 5255" /></label>
                      <label className={label}>Category<input name="category" className={input} placeholder="Travel, fuel, utilities…" required /></label>
                      <label className={label}>Expense type
                        <select name="expenseType" className={select}><option value="one_off">One-off</option><option value="recurring">Recurring</option><option value="service_utility">Service / utility</option><option value="fuel">Fuel</option><option value="travel">Travel</option><option value="other">Other</option></select>
                      </label>
                      <label className={label}>Quantity<input name="quantity" type="number" min="0.001" step="0.001" className={input} required /></label>
                      <label className={label}>Unit<input name="unitMeasure" className={input} placeholder="litres, trips, hours…" required /></label>
                      <label className={label}>Unit cost ({data.currencyCode})<input name="unitCost" type="number" min="0" step="0.01" className={input} required onChange={(event) => {
                        const form = event.currentTarget.form;
                        const quantity = Number(new FormData(form ?? undefined).get("quantity") ?? 0);
                        if (quantity) setExpenseAmount((quantity * Number(event.currentTarget.value || 0)).toFixed(2));
                      }} /></label>
                      <label className={label}>Total cost ({data.currencyCode})<input name="amount" type="number" min="0.01" step="0.01" className={input} value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required /></label>
                      <label className={label}>Status<select name="status" className={select}><option value="planned">Planned</option><option value="in_review">In review</option><option value="actual">Actual / paid</option></select></label>
                      <label className={`${label} sm:col-span-2 lg:col-span-3`}>Description<input name="description" className={input} placeholder="What is being done or purchased?" required /></label>
                      <label className={`${label} sm:col-span-2 lg:col-span-3`}>Comment<textarea name="comment" rows={2} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-950 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15" placeholder="Assumptions, activity details, or context" /></label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><h3 className="font-bold text-slate-900">Compare vendor quotes</h3><p className="text-xs text-slate-600">The selected vendor is saved as the primary quote. Add alternatives for this line.</p></div>
                        <button type="button" className={secondary} onClick={() => setQuotes((rows) => [...rows, { vendorId: "", unitCost: "", totalCost: "", note: "" }])}>Add quote</button>
                      </div>
                      {quotes.map((quote, index) => (
                        <div key={index} className="mt-3 grid gap-2 sm:grid-cols-4">
                          <select value={quote.vendorId} onChange={(event) => setQuotes((rows) => rows.map((row, i) => i === index ? { ...row, vendorId: event.target.value } : row))} className={select}><option value="">Alternative vendor</option>{data.vendors.map((vendor) => <option key={vendor.vendor_id} value={vendor.vendor_id}>{vendor.vendor_name}</option>)}</select>
                          <input value={quote.unitCost} onChange={(event) => setQuotes((rows) => rows.map((row, i) => i === index ? { ...row, unitCost: event.target.value } : row))} type="number" min="0" step="0.01" className={input} placeholder="Unit cost" />
                          <input value={quote.totalCost} onChange={(event) => setQuotes((rows) => rows.map((row, i) => i === index ? { ...row, totalCost: event.target.value } : row))} type="number" min="0" step="0.01" className={input} placeholder="Total quote" />
                          <input value={quote.note} onChange={(event) => setQuotes((rows) => rows.map((row, i) => i === index ? { ...row, note: event.target.value } : row))} className={input} placeholder="Quote note" />
                        </div>
                      ))}
                    </div>

                    <div aria-live="polite" className={`rounded-2xl border p-4 ${previewRemaining < 0 ? "border-rose-200 bg-rose-50" : "border-violet-200 bg-violet-50"}`}>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Balance preview · {selectedNest?.code ?? "Select nest"}</p>
                      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                        <div><p className="text-xs text-slate-600">Available before save</p><p className="font-bold">{cash(selectedAllocated - selectedCommitted, data.currencyCode)}</p></div>
                        <div className="text-right"><p className="text-xs text-slate-600">After this line</p><p className={`text-2xl font-extrabold ${previewRemaining < 0 ? "text-rose-700" : "text-emerald-700"}`}>{cash(previewRemaining, data.currencyCode)}</p></div>
                      </div>
                    </div>
                    <div className="flex justify-end"><button disabled={saving || !data.items.length || !data.vendors.length} className={button}>{saving ? "Saving…" : "Save planning line"}</button></div>
                  </form>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5"><p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Quarter view</p><h2 className="mt-1 text-xl font-bold">Nest comparison</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Nest</th><th className="p-3">Allocated</th><th className="p-3">Committed</th><th className="p-3">Remaining</th><th className="p-3">Used</th></tr></thead>
                    <tbody>{data.nests.map((nest) => {
                      const allocated = allocations.get(Number(nest.id)) ?? 0;
                      const committed = committedByNest.get(Number(nest.id)) ?? 0;
                      const percent = allocated ? committed / allocated * 100 : 0;
                      return <tr key={nest.id} className="border-t border-slate-100"><td className="p-3 font-bold">{nest.code}<span className="ml-2 font-normal text-slate-500">{nest.name}</span></td><td className="p-3">{cash(allocated, data.currencyCode)}</td><td className="p-3">{cash(committed, data.currencyCode)}</td><td className={`p-3 font-bold ${allocated - committed < 0 ? "text-rose-700" : "text-emerald-700"}`}>{cash(allocated - committed, data.currencyCode)}</td><td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${percent > 100 ? "bg-rose-500" : percent >= 80 ? "bg-amber-500" : "bg-violet-600"}`} style={{ width: `${Math.min(100, percent)}%` }} /></div><span>{percent.toFixed(0)}%</span></div></td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </section>

              {mode === "finance" && (
                <section className="grid gap-5 lg:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Category analysis</p>
                    <h2 className="mt-1 text-lg font-bold">Committed by category</h2>
                    <div className="mt-4 space-y-3">{[...spendByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => {
                      const percent = totalCommitted ? value / totalCommitted * 100 : 0;
                      return <div key={name}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{name}</span><span className="font-bold">{cash(value, data.currencyCode)}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${percent}%` }} /></div></div>;
                    })}</div>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Country comparison</p>
                    <h2 className="mt-1 text-lg font-bold">Same quarter across your countries</h2>
                    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Country</th><th className="py-2">Committed</th><th className="py-2">Remaining</th><th className="py-2">USD</th></tr></thead><tbody>{data.countryComparison.map((row) => <tr key={row.country} className="border-t border-slate-100"><td className="py-2 font-bold">{row.country}</td><td className="py-2">{cash(row.committed, row.currencyCode)}</td><td className="py-2">{cash(row.remaining, row.currencyCode)}</td><td className="py-2">{row.committedUsd == null ? "Add quarter FX rate" : cash(row.committedUsd, "USD")}</td></tr>)}</tbody></table></div>
                  </article>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5"><p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Audit trail</p><h2 className="mt-1 text-xl font-bold">Planning and expense lines</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Nest</th><th className="p-3">Item / GL</th><th className="p-3">Vendor quotes</th><th className="p-3">Status</th><th className="p-3">Amount</th><th className="p-3">Review</th></tr></thead>
                    <tbody>{data.entries.map((entry) => {
                      const entryQuotes = quoteGroups.get(entry.expense_id) ?? [];
                      return <tr key={entry.expense_id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap p-3">{new Date(entry.created_at).toLocaleDateString()}</td><td className="p-3 font-bold">{data.nests.find((nest) => Number(nest.id) === entry.nest_id)?.code ?? "—"}</td><td className="p-3"><div className="font-bold">{entry.item_code_snapshot} · {entry.item_name_snapshot}</div><div className="mt-1 text-xs text-slate-500">{entry.gl_code || "No GL"} · {entry.category || "Uncategorised"}</div><div className="mt-1 text-xs text-slate-600">{entry.description}</div></td><td className="p-3">{entryQuotes.map((quote) => <div key={quote.quote_id} className={quote.is_selected ? "font-bold text-emerald-700" : "text-slate-600"}>{quote.vendor_name_snapshot}: {cash(num(quote.total_cost), data.currencyCode)}{quote.is_selected ? " · selected" : ""}</div>)}</td><td className="p-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">{labelize(entry.status)}</span></td><td className="whitespace-nowrap p-3 font-extrabold">{cash(entry.status === "actual" && entry.actual_amount != null ? num(entry.actual_amount) : num(entry.amount), data.currencyCode)}</td><td className="p-3">{manager && entry.status !== "actual" && entry.status !== "rejected" && <div className="flex flex-wrap gap-2"><button className={secondary} disabled={saving} onClick={() => void post({ action: "review_expense", cycleId: cycle.cycle_id, expenseId: entry.expense_id, status: "approved" })}>Approve</button><button className={secondary} disabled={saving} onClick={() => void post({ action: "review_expense", cycleId: cycle.cycle_id, expenseId: entry.expense_id, status: "rejected" })}>Reject</button><button className={secondary} disabled={saving} onClick={() => void post({ action: "review_expense", cycleId: cycle.cycle_id, expenseId: entry.expense_id, status: "actual" })}>Mark actual</button></div>}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </section>

              {mode === "finance" && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Trend</p>
                  <h2 className="mt-1 text-xl font-bold">Quarter history · {country}</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.cycles.map((historical) => {
                    const records = data.historyEntries.filter((entry) => entry.cycle_id === historical.cycle_id && entry.status !== "rejected");
                    const total = records.reduce((sum, entry) => sum + (entry.status === "actual" && entry.actual_amount != null ? num(entry.actual_amount) : num(entry.amount)), 0);
                    return <button key={historical.cycle_id} onClick={() => { setCycleId(historical.cycle_id); void load(country, historical.cycle_id); }} className={`rounded-xl border p-4 text-left transition hover:border-violet-300 ${historical.cycle_id === cycle.cycle_id ? "border-violet-300 bg-violet-50" : "border-slate-200"}`}><span className="text-sm font-bold">{cycleName(historical)}</span><span className="mt-1 block text-xs text-slate-500">{labelize(historical.status)}</span><span className="mt-3 block font-extrabold">{cash(total, historical.currency_code)}</span></button>;
                  })}</div>
                </section>
              )}
            </>
          )}

          {tab === "budget" && (
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div><p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">Sheet planning lines</p><h2 className="mt-1 text-xl font-bold">Budget by department, GL code, and scope</h2></div>
              {manager && cycle.status !== "closed" && <form onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                void post({ action: "save_budget_line", cycleId: cycle.cycle_id, ...values });
                event.currentTarget.reset();
              }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={label}>Scope<select name="scopeType" className={select}><option value="nest">Nest</option><option value="country">Country</option><option value="hq">HQ</option><option value="central">Central</option><option value="donor_program">Donor program</option><option value="other">Other</option></select></label>
                <label className={label}>Nest<select name="nestId" className={select}><option value="">Country / central scope</option>{data.nests.map((nest) => <option key={nest.id} value={nest.id}>{nest.code}</option>)}</select></label>
                <label className={label}>Department<input name="department" className={input} /></label>
                <label className={label}>GL code<input name="glCode" className={input} /></label>
                <label className={label}>Category<input name="category" className={input} required /></label>
                <label className={label}>Scope label<input name="scopeLabel" className={input} placeholder="Optional label" /></label>
                <label className={label}>Budget ({data.currencyCode})<input name="budgetAmount" type="number" min="0" step="0.01" className={input} required /></label>
                <label className={label}>Unit<input name="unitMeasure" className={input} /></label>
                <label className={`${label} lg:col-span-3`}>Notes<input name="notes" className={input} /></label>
                <button className={`${button} self-end`} disabled={saving}>Save budget line</button>
              </form>}
              <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Scope</th><th className="p-3">Nest</th><th className="p-3">Department / GL</th><th className="p-3">Category</th><th className="p-3">Budget</th><th className="p-3">Notes</th></tr></thead><tbody>{data.budgetLines.map((line) => <tr key={line.budget_id} className="border-t border-slate-100"><td className="p-3">{labelize(line.scope_type)} {line.scope_label}</td><td className="p-3">{data.nests.find((nest) => Number(nest.id) === line.nest_id)?.code ?? "Country-wide"}</td><td className="p-3">{line.department ?? "—"} · {line.gl_code ?? "—"}</td><td className="p-3">{line.category ?? "—"}</td><td className="p-3 font-bold">{cash(num(line.budget_amount), data.currencyCode)}</td><td className="p-3">{line.notes ?? "—"}</td></tr>)}</tbody></table></div>
            </section>
          )}

          {tab === "fuel" && (
            <section className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                {manager && <form onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                  void post({ action: "add_fuel_asset", cycleId: cycle.cycle_id, country, ...values });
                  event.currentTarget.reset();
                }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">Add vehicle, generator, or fuel card</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={label}>Nest<select name="nestId" className={select} required><option value="">Choose nest</option>{data.nests.map((nest) => <option key={nest.id} value={nest.id}>{nest.code}</option>)}</select></label>
                    <label className={label}>Asset type<select name="assetType" className={select}><option value="vehicle">Vehicle</option><option value="generator">Generator</option><option value="fuel_card">Fuel card</option><option value="other">Other</option></select></label>
                    <label className={label}>Identifier<input name="identifier" className={input} required placeholder="Plate number or card ID" /></label>
                    <label className={label}>Model<input name="model" className={input} /></label>
                    <label className={label}>Fuel type<input name="fuelType" className={input} /></label>
                    <label className={label}>Vendor<input name="vendorName" className={input} /></label>
                    <label className={label}>Purpose<input name="purpose" className={input} /></label>
                    <button disabled={saving} className={`${button} self-end`}>Add asset</button>
                  </div>
                </form>}
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                  void post({ action: "save_fuel_plan", cycleId: cycle.cycle_id, ...values });
                  event.currentTarget.reset();
                }} className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">Project quarterly fuel cost</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={label}>Asset<select name="assetId" className={select} required><option value="">Choose asset</option>{data.fuelAssets.map((asset) => <option key={asset.asset_id} value={asset.asset_id}>{asset.identifier} · {asset.asset_type}</option>)}</select></label>
                    <label className={label}>Nest<select name="nestId" className={select} required><option value="">Choose nest</option>{data.nests.map((nest) => <option key={nest.id} value={nest.id}>{nest.code}</option>)}</select></label>
                    <label className={label}>Monthly km or hours<input name="projectedMonthlyActivity" type="number" min="0" step="0.01" className={input} required /></label>
                    <label className={label}>Consumption basis<select name="consumptionBasis" className={select}><option value="per_100km">Litres per 100 km</option><option value="per_hour">Litres per hour</option></select></label>
                    <label className={label}>Consumption rate<input name="consumptionRate" type="number" min="0" step="0.001" className={input} required /></label>
                    <label className={label}>Cost per litre ({data.currencyCode})<input name="costPerLitre" type="number" min="0" step="0.01" className={input} required /></label>
                    <button disabled={saving || !data.fuelAssets.length} className={`${button} sm:col-span-2`}>Save fuel projection</button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Quarterly projection is monthly usage × 3 × consumption rate × cost per litre. Vehicle consumption uses the per-100-km factor.</p>
                </form>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">Fuel forecast</h2>
                <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Asset</th><th className="p-3">Nest</th><th className="p-3">Litres / quarter</th><th className="p-3">Estimated cost</th></tr></thead><tbody>{data.fuelPlans.map((plan) => <tr key={plan.fuel_plan_id} className="border-t border-slate-100"><td className="p-3 font-bold">{data.fuelAssets.find((asset) => asset.asset_id === plan.asset_id)?.identifier ?? "Asset"}</td><td className="p-3">{data.nests.find((nest) => Number(nest.id) === plan.nest_id)?.code ?? "—"}</td><td className="p-3">{num(plan.estimated_quarterly_litres).toFixed(1)} L</td><td className="p-3 font-bold">{cash(num(plan.estimated_quarterly_cost), data.currencyCode)}</td></tr>)}</tbody></table></div>
              </div>
            </section>
          )}

          {tab === "catalog" && (
            <section className="space-y-5">
              {manager && <div className="grid gap-5 lg:grid-cols-2">
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                  void post({ action: "add_item", country, ...values });
                  event.currentTarget.reset();
                }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">Add country expense item</h2>
                  <p className="mt-1 text-sm text-slate-600">Use the item codes from the country sheet.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={label}>Item code<input name="itemCode" className={input} required /></label>
                    <label className={label}>Item name<input name="itemName" className={input} required /></label>
                    <label className={label}>Category<input name="category" className={input} required /></label>
                    <button disabled={saving} className={`${button} self-end`}>Add item</button>
                  </div>
                </form>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                  void post({ action: "add_vendor", country, ...values });
                  event.currentTarget.reset();
                }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">Add vendor for {country}</h2>
                  <p className="mt-1 text-sm text-slate-600">The vendor will appear only in this country’s selector.</p>
                  <div className="mt-3 flex gap-3"><input name="vendorName" className={input} required placeholder="Vendor name" /><button disabled={saving} className={button}>Add vendor</button></div>
                </form>
              </div>}
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Expense items · {country}</h2><div className="mt-3 space-y-2">{data.items.map((item) => <div key={item.item_id} className="flex justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-bold">{item.item_code}</span><span className="flex-1">{item.item_name}</span><span className="text-slate-500">{item.category}</span></div>)}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Approved vendors · {country}</h2><div className="mt-3 space-y-2">{data.vendors.map((vendor) => <div key={vendor.vendor_id} className="rounded-lg bg-slate-50 p-3 text-sm font-semibold">{vendor.vendor_name}</div>)}</div></div>
              </div>
            </section>
          )}

          {manager && tab === "overview" && cycle.status !== "closed" && (
            <form onSubmit={(event) => {
              event.preventDefault();
              const rate = new FormData(event.currentTarget).get("fxRateToUsd");
              void post({ action: "save_fx_rate", cycleId: cycle.cycle_id, fxRateToUsd: rate }).then((result) => {
                if (result) setNotice("Quarter exchange rate saved.");
              });
            }} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className={`${label} max-w-xs`}>USD per 1 {data.currencyCode}<input name="fxRateToUsd" type="number" min="0.000001" step="0.000001" defaultValue={cycle.fx_rate_to_usd ?? ""} className={input} required /></label>
              <button disabled={saving} className={secondary}>Save exchange rate</button>
              <span className="text-xs text-slate-500">Used only for cross-country comparison.</span>
            </form>
          )}
        </>
      )}
    </main>
  );
}