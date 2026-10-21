"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Cycle = {
  cycle_id: string;
  country: string;
  fiscal_year: number;
  quarter: number;
  currency_code: string;
  status: "draft" | "open" | "in_review" | "approved" | "closed";
  owner_user_id: string | null;
  source_cycle_id: string | null;
};

type Budget = {
  budget_id: string;
  nest_id: number | null;
  department: string;
  gl_code: string;
  category: string;
  budget_amount: number | string;
  notes: string | null;
};

type ExpenseRequest = {
  expense_id: string;
  nest_id: number | null;
  department: string;
  gl_code: string;
  category: string;
  expense_type: "recurring" | "one_off" | "nte_budget";
  description: string;
  unit_measure: string | null;
  quantity: number | string | null;
  requested_amount: number | string;
  approved_amount: number | string | null;
  vendor_name: string | null;
  status: string;
  requester_note: string | null;
  review_note: string | null;
};

type Nest = { id: string; code: string; name: string };

type DashboardData = {
  countries: string[];
  country: string;
  currencyCode: string;
  nests: Nest[];
  cycles: Cycle[];
  selectedCycle: Cycle | null;
  budgets: Budget[];
  requests: ExpenseRequest[];
};

type Props = { mode?: "planning" | "finance" };

const emptyData: DashboardData = {
  countries: [],
  country: "",
  currencyCode: "USD",
  nests: [],
  cycles: [],
  selectedCycle: null,
  budgets: [],
  requests: [],
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function cycleLabel(cycle: Cycle): string {
  return `Q${cycle.quarter} ${cycle.fiscal_year}`;
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function QuarterlyExpenseWorkspace({ mode = "planning" }: Props) {
  const readOnly = mode === "finance";
  const [data, setData] = useState<DashboardData>(emptyData);
  const [country, setCountry] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newQuarter, setNewQuarter] = useState(1);
  const [budgetForm, setBudgetForm] = useState({
    department: "",
    glCode: "",
    category: "",
    amount: "",
    nestId: "",
    notes: "",
  });
  const [requestForm, setRequestForm] = useState({
    department: "",
    glCode: "",
    category: "",
    expenseType: "recurring",
    description: "",
    unitMeasure: "",
    quantity: "",
    amount: "",
    vendorName: "",
    nestId: "",
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (cycleId) params.set("cycleId", cycleId);
      const response = await fetch(`/api/expenses/quarterly?${params.toString()}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load expense planning data.");
      const next = result as DashboardData;
      setData(next);
      if (!country && next.country) setCountry(next.country);
      if (!cycleId && next.selectedCycle?.cycle_id) setCycleId(next.selectedCycle.cycle_id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load expense planning data.");
    } finally {
      setLoading(false);
    }
  }, [country, cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCycle = data.selectedCycle;
  const canEdit = !readOnly && activeCycle !== null && activeCycle.status !== "approved" && activeCycle.status !== "closed";

  const categoryTotals = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      glCode: string;
      category: string;
      budget: number;
      requested: number;
      approved: number;
    }>();

    for (const budget of data.budgets) {
      const key = `${budget.gl_code}::${budget.category}`;
      const existing = groups.get(key) ?? {
        key,
        glCode: budget.gl_code,
        category: budget.category,
        budget: 0,
        requested: 0,
        approved: 0,
      };
      existing.budget += toNumber(budget.budget_amount);
      groups.set(key, existing);
    }

    for (const item of data.requests) {
      const key = `${item.gl_code}::${item.category}`;
      const existing = groups.get(key) ?? {
        key,
        glCode: item.gl_code,
        category: item.category,
        budget: 0,
        requested: 0,
        approved: 0,
      };
      existing.requested += toNumber(item.requested_amount);
      existing.approved += item.status === "approved" ? toNumber(item.approved_amount) : 0;
      groups.set(key, existing);
    }

    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
  }, [data.budgets, data.requests]);

  const totals = useMemo(() => categoryTotals.reduce(
    (acc, row) => ({
      budget: acc.budget + row.budget,
      requested: acc.requested + row.requested,
      approved: acc.approved + row.approved,
    }),
    { budget: 0, requested: 0, approved: 0 },
  ), [categoryTotals]);

  const maxBar = Math.max(1, ...categoryTotals.flatMap((row) => [row.budget, row.requested, row.approved]));

  async function postAction(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/expenses/quarterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the expense data.");
      setMessage("Saved.");
      if (result.cycle?.cycle_id) setCycleId(result.cycle.cycle_id);
      await load();
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the expense data.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await postAction({
      action: "create_cycle",
      country,
      fiscalYear: newYear,
      quarter: newQuarter,
    });
    if (ok) setMessage(`Created Q${newQuarter} ${newYear} as a draft cycle.`);
  }

  async function addBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCycle) return;
    const ok = await postAction({
      action: "add_budget",
      cycleId: activeCycle.cycle_id,
      department: budgetForm.department,
      glCode: budgetForm.glCode,
      category: budgetForm.category,
      budgetAmount: budgetForm.amount,
      nestId: budgetForm.nestId || null,
      notes: budgetForm.notes,
    });
    if (ok) setBudgetForm({ department: "", glCode: "", category: "", amount: "", nestId: "", notes: "" });
  }

  async function addRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCycle) return;
    const ok = await postAction({
      action: "add_request",
      cycleId: activeCycle.cycle_id,
      department: requestForm.department,
      glCode: requestForm.glCode,
      category: requestForm.category,
      expenseType: requestForm.expenseType,
      description: requestForm.description,
      unitMeasure: requestForm.unitMeasure,
      quantity: requestForm.quantity || null,
      requestedAmount: requestForm.amount,
      vendorName: requestForm.vendorName,
      nestId: requestForm.nestId || null,
      note: requestForm.note,
    });
    if (ok) setRequestForm({
      department: "",
      glCode: "",
      category: "",
      expenseType: "recurring",
      description: "",
      unitMeasure: "",
      quantity: "",
      amount: "",
      vendorName: "",
      nestId: "",
      note: "",
    });
  }

  const cycleStatusAction: Record<string, { label: string; status: string } | null> = {
    draft: { label: "Open this quarter", status: "open" },
    open: { label: "Send to review", status: "in_review" },
    in_review: { label: "Approve cycle", status: "approved" },
    approved: { label: "Close quarter", status: "closed" },
    closed: null,
  };
  const nextCycleAction = activeCycle ? cycleStatusAction[activeCycle.status] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-violet-700">
            {readOnly ? "FINANCE · QUARTERLY EXPENSES" : "QUARTERLY PLANNING"}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {readOnly ? "Expense analysis" : "Operating expense plans"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review non-inventory spending such as fuel, travel, contractors, and insurance by quarter.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Country
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setCycleId("");
              }}
              className="h-10 min-w-36 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              {data.countries.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Quarter
            <select
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              className="h-10 min-w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">No cycle</option>
              {data.cycles.map((cycle) => (
                <option key={cycle.cycle_id} value={cycle.cycle_id}>
                  {cycleLabel(cycle)} · {statusLabel(cycle.status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {message && !error && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      {!readOnly && (
        <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Quarterly cycle</h2>
              <p className="mt-1 text-sm text-slate-600">
                Create a draft quarter, enter its budgets and requests, then open it for work.
              </p>
            </div>
            <form onSubmit={createCycle} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Fiscal year
                <input type="number" min={2020} max={2100} value={newYear} onChange={(event) => setNewYear(Number(event.target.value))} className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Quarter
                <select value={newQuarter} onChange={(event) => setNewQuarter(Number(event.target.value))} className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                  {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}
                </select>
              </label>
              <button disabled={saving || !country} className="h-10 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:opacity-50">
                {saving ? "Saving…" : "Create quarter"}
              </button>
            </form>
          </div>
          {activeCycle && nextCycleAction && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white p-3">
              <p className="text-sm text-slate-600">
                Selected cycle: <strong className="text-slate-900">{cycleLabel(activeCycle)}</strong> · {statusLabel(activeCycle.status)}
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void postAction({ action: "set_cycle_status", cycleId: activeCycle.cycle_id, status: nextCycleAction.status })}
                className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
              >
                {nextCycleAction.label}
              </button>
            </div>
          )}
        </section>
      )}

      {loading && !data.country ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading quarterly expense data…</div>
      ) : !activeCycle ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-900">No quarter has been created yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            {readOnly ? "A finance or operations owner can create the first cycle from Quarterly Planning." : "Create a quarter above to start entering budgets and expenses."}
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Budget", totals.budget],
              ["Requested", totals.requested],
              ["Approved", totals.approved],
              ["Remaining vs. budget", totals.budget - totals.approved],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{money(Number(value), data.currencyCode)}</p>
                <p className="mt-1 text-xs text-slate-500">{cycleLabel(activeCycle)} · {country}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-950">Budget and request comparison</h2>
              <p className="mt-1 text-sm text-slate-500">Compare allocated budget with requested and approved amounts by GL category.</p>
            </div>
            <div className="space-y-5 p-5">
              {categoryTotals.length === 0 ? (
                <p className="py-5 text-center text-sm text-slate-500">Add budget categories or expense requests to build the comparison.</p>
              ) : categoryTotals.map((row) => (
                <div key={row.key} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">{row.category}</span>
                      <span className="ml-2 text-xs text-slate-500">{row.glCode}</span>
                    </div>
                    <span className="text-xs text-slate-500">Budget {money(row.budget, data.currencyCode)} · Requested {money(row.requested, data.currencyCode)} · Approved {money(row.approved, data.currencyCode)}</span>
                  </div>
                  {[
                    ["Budget", row.budget, "bg-slate-400"],
                    ["Requested", row.requested, "bg-violet-500"],
                    ["Approved", row.approved, "bg-emerald-500"],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] text-slate-500">{label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (Number(value) / maxBar) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {!readOnly && (
            <section className="grid gap-5 xl:grid-cols-2">
              <form onSubmit={addBudget} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="font-semibold text-slate-950">Add category budget</h2>
                  <p className="mt-1 text-sm text-slate-500">Set the planned amount for a GL category in this quarter.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={budgetForm.department} onChange={(e) => setBudgetForm({ ...budgetForm, department: e.target.value })} placeholder="Department" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input required value={budgetForm.glCode} onChange={(e) => setBudgetForm({ ...budgetForm, glCode: e.target.value })} placeholder="GL code" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input required value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} placeholder="Category" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input required type="number" min="0" step="0.01" value={budgetForm.amount} onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })} placeholder={`Budget amount (${data.currencyCode})`} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <select value={budgetForm.nestId} onChange={(e) => setBudgetForm({ ...budgetForm, nestId: e.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Country-level budget</option>
                    {data.nests.map((nest) => <option key={nest.id} value={nest.id}>{nest.code} · {nest.name}</option>)}
                  </select>
                  <input value={budgetForm.notes} onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} placeholder="Finance note (optional)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </div>
                <button disabled={!canEdit || saving} className="h-10 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">Save budget</button>
              </form>

              <form onSubmit={addRequest} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="font-semibold text-slate-950">Add expense request</h2>
                  <p className="mt-1 text-sm text-slate-500">Record a planned expense without changing stock balances.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={requestForm.department} onChange={(e) => setRequestForm({ ...requestForm, department: e.target.value })} placeholder="Department" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input required value={requestForm.glCode} onChange={(e) => setRequestForm({ ...requestForm, glCode: e.target.value })} placeholder="GL code" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input required value={requestForm.category} onChange={(e) => setRequestForm({ ...requestForm, category: e.target.value })} placeholder="Category" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <select value={requestForm.expenseType} onChange={(e) => setRequestForm({ ...requestForm, expenseType: e.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                    <option value="recurring">Recurring</option><option value="one_off">One-off</option><option value="nte_budget">NTE budget</option>
                  </select>
                  <input required value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} placeholder="Expense description" className="h-10 rounded-lg border border-slate-200 px-3 text-sm sm:col-span-2" />
                  <input required type="number" min="0" step="0.01" value={requestForm.amount} onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })} placeholder={`Requested amount (${data.currencyCode})`} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input value={requestForm.vendorName} onChange={(e) => setRequestForm({ ...requestForm, vendorName: e.target.value })} placeholder="Vendor / provider (optional)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} placeholder="Quantity (optional)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <input value={requestForm.unitMeasure} onChange={(e) => setRequestForm({ ...requestForm, unitMeasure: e.target.value })} placeholder="Unit (e.g. per month)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                  <select value={requestForm.nestId} onChange={(e) => setRequestForm({ ...requestForm, nestId: e.target.value })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Country-level expense</option>
                    {data.nests.map((nest) => <option key={nest.id} value={nest.id}>{nest.code} · {nest.name}</option>)}
                  </select>
                  <input value={requestForm.note} onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })} placeholder="Justification or note" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </div>
                <button disabled={!canEdit || saving} className="h-10 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">Save expense request</button>
              </form>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-950">Expense requests</h2>
              <p className="mt-1 text-sm text-slate-500">Requests remain separate from consumables and inventory movements.</p>
            </div>
            {data.requests.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No requests have been entered for this quarter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3">Expense</th><th className="px-5 py-3">Category / GL</th><th className="px-5 py-3">Nest</th><th className="px-5 py-3">Requested</th><th className="px-5 py-3">Approved</th><th className="px-5 py-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {data.requests.map((request) => (
                      <tr key={request.expense_id} className="border-t border-slate-100">
                        <td className="px-5 py-4"><p className="font-medium text-slate-900">{request.description}</p><p className="mt-1 text-xs text-slate-500">{request.vendor_name ?? request.expense_type.replaceAll("_", " ")}</p></td>
                        <td className="px-5 py-4"><p className="text-slate-800">{request.category}</p><p className="mt-1 text-xs text-slate-500">{request.gl_code}</p></td>
                        <td className="px-5 py-4 text-slate-600">{data.nests.find((nest) => Number(nest.id) === request.nest_id)?.code ?? "Country"}</td>
                        <td className="px-5 py-4 font-medium text-slate-900">{money(toNumber(request.requested_amount), data.currencyCode)}</td>
                        <td className="px-5 py-4 text-slate-700">{request.approved_amount === null ? "—" : money(toNumber(request.approved_amount), data.currencyCode)}</td>
                        <td className="px-5 py-4"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">{statusLabel(request.status)}</span>{request.review_note && <p className="mt-1 max-w-48 text-xs text-slate-500">{request.review_note}</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
