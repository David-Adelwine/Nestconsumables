"use client";

import { useEffect, useMemo, useState } from "react";

type Team = "flight" | "fulfilment" | "facilities";

type Nest = {
  id: string;
  code: string;
  name: string;
};

type Item = {
  id: string;
  code: string;
  name: string;
  team: Team;
  category: string | null;
  uom: string;
  unitCost: number | null;
  currencyCode: string;
};

type PlanLine = {
  itemId: string;
  quantities: Record<string, number | null>;
};

type PageData = {
  countries: string[];
  country: string;
  currencyCode: string;
  nests: Nest[];
  items: Item[];
};

const teamLabels: Record<Team, string> = {
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function currentQuarter() {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}

export default function StockPlanBuilderPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [period, setPeriod] = useState(currentQuarter());
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">(
    "quarterly",
  );
  const [activeNestIds, setActiveNestIds] = useState<string[]>([]);
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [status, setStatus] = useState("draft");
  const [notice, setNotice] = useState("");

  async function load(nextCountry = "") {
    setLoading(true);
    setError("");

    try {
      const query = nextCountry
        ? `?country=${encodeURIComponent(nextCountry)}`
        : "";
      const response = await fetch(`/api/procurement/stock-plans${query}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to load stock plan data.");
      }

      const nextData = result as PageData;

      setData(nextData);
      setCountry(nextData.country);
      setActiveNestIds(nextData.nests.map((nest) => nest.id));
      setPlanName(`${nextData.country} Quarterly Stock Plan`);
      setLines([]);
      setPlanId(null);
      setStatus("draft");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load stock plan data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  const nests = data?.nests ?? [];
  const items = data?.items ?? [];
  const currency = data?.currencyCode ?? "GHS";

  const categoryOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.category || "Unassigned"))].sort(),
    [items],
  );

  const planItems = lines
    .map((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return item ? { ...item, quantities: line.quantities } : null;
    })
    .filter(
      (item): item is Item & { quantities: PlanLine["quantities"] } =>
        item !== null,
    );

  const availableCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    const alreadyAdded = new Set(lines.map((line) => line.itemId));

    return items.filter((item) => {
      const matchesTeam = !teamFilter || item.team === teamFilter;
      const matchesCategory =
        !categoryFilter ||
        (item.category || "Unassigned") === categoryFilter;
      const text = [
        item.name,
        item.code,
        teamLabels[item.team],
        item.category ?? "Unassigned",
        item.uom,
      ]
        .join(" ")
        .toLowerCase();

      return (
        !alreadyAdded.has(item.id) &&
        matchesTeam &&
        matchesCategory &&
        (!query || text.includes(query))
      );
    });
  }, [items, lines, search, teamFilter, categoryFilter]);

  const selectedNests = nests.filter((nest) =>
    activeNestIds.includes(nest.id),
  );

  const planTotal = planItems.reduce((total, item) => {
    const quantity = selectedNests.reduce(
      (sum, nest) => sum + (item.quantities[nest.id] ?? 0),
      0,
    );

    return total + quantity * (item.unitCost ?? 0);
  }, 0);

  const teams: Team[] = ["flight", "fulfilment", "facilities"];

  const teamTotals = teams.map((team) => ({
    team,
    total: planItems
      .filter((item) => item.team === team)
      .reduce((sum, item) => {
        const quantity = selectedNests.reduce(
          (lineSum, nest) =>
            lineSum + (item.quantities[nest.id] ?? 0),
          0,
        );

        return sum + quantity * (item.unitCost ?? 0);
      }, 0),
  }));

  const nestTotals = selectedNests.map((nest) => ({
    nest,
    total: planItems.reduce(
      (sum, item) =>
        sum +
        (item.quantities[nest.id] ?? 0) * (item.unitCost ?? 0),
      0,
    ),
  }));

  function toggleNest(id: string) {
    setActiveNestIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function updateQuantity(itemId: string, nestId: string, raw: string) {
    const quantity = raw === "" ? null : Number(raw);

    if (
      quantity !== null &&
      (!Number.isFinite(quantity) || quantity < 0)
    ) {
      return;
    }

    setLines((current) =>
      current.map((line) =>
        line.itemId === itemId
          ? {
              ...line,
              quantities: { ...line.quantities, [nestId]: quantity },
            }
          : line,
      ),
    );
  }

  function addItem() {
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;

    setLines((current) => [
      ...current,
      {
        itemId: item.id,
        quantities: Object.fromEntries(
          nests.map((nest) => [nest.id, null]),
        ),
      },
    ]);
    setSelectedItemId("");
    setNotice(`${item.name} added. Enter quantities by nest.`);
  }

  function removeItem(itemId: string) {
    setLines((current) =>
      current.filter((line) => line.itemId !== itemId),
    );
  }

  async function save(mode: "draft" | "submit") {
    if (
      !planName.trim() ||
      !period.trim() ||
      activeNestIds.length === 0 ||
      lines.length === 0
    ) {
      setNotice(
        "Enter the plan details, select at least one nest, and add an item.",
      );
      return;
    }

    if (planItems.some((item) => item.unitCost === null)) {
      setNotice("Set a price for every plan item before saving.");
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const response = await fetch("/api/procurement/stock-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          mode,
          planName,
          country,
          frequency,
          period,
          nestIds: activeNestIds,
          lines,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to save the plan.");
      }

      setPlanId(result.planId);
      setStatus(result.status);
      setNotice(
        mode === "submit"
          ? "Plan submitted for finance review."
          : "Plan saved as a draft.",
      );
    } catch (saveError) {
      setNotice(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the plan.",
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  const selectClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-100 via-white to-white p-6 shadow-sm sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-100/80 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">
              Procurement workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Stock plan
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Create a reusable stock list, assign quantities to each nest, and
              review estimated costs before finance submission.
            </p>
          </div>
          <span className="w-fit rounded-full border border-violet-200 bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-violet-900 shadow-sm">
            {status.replaceAll("_", " ")}
          </span>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm font-medium text-violet-950 shadow-sm"
        >
          {notice}
        </p>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
              Plan setup
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              Plan details
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Set the country, schedule, and name for this reusable plan.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Plan name
              </span>
              <input
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Country
              </span>
              <select
                value={country}
                onChange={(event) => void load(event.target.value)}
                className={selectClass}
              >
                {(data?.countries ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Frequency
              </span>
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(
                    event.target.value as "monthly" | "quarterly",
                  )
                }
                className={selectClass}
              >
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Period
              </span>
              <input
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder={currentQuarter()}
                className={inputClass}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Currency
              </span>
              <input
                value={currency}
                readOnly
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-600`}
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                Distribution scope
              </p>
              <h2 className="mt-1 font-bold text-slate-950">Nests included</h2>
              <p className="mt-1 text-sm text-slate-600">
                Only nests within your access are listed.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setActiveNestIds(
                  activeNestIds.length === nests.length
                    ? []
                    : nests.map((nest) => nest.id),
                )
              }
              className="rounded-lg px-2 py-1 text-xs font-bold text-violet-800 transition hover:bg-violet-50 hover:text-violet-950"
            >
              {activeNestIds.length === nests.length ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {nests.map((nest) => (
              <label
                key={nest.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-violet-300 hover:bg-violet-50 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-100 has-[:checked]:text-violet-950"
              >
                <input
                  type="checkbox"
                  checked={activeNestIds.includes(nest.id)}
                  onChange={() => toggleNest(nest.id)}
                  className="h-4 w-4 accent-violet-800"
                />
                <span>{nest.code}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {activeNestIds.length} of {nests.length} nests selected
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
                Master catalogue
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                Build your nest list
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Select items from the master catalogue, then set a quantity for
                every selected nest.
              </p>
            </div>
            <label className="w-full lg:max-w-sm">
              <span className="sr-only">Search catalog</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search catalog by name, code, or team"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Team
              </span>
              <select
                value={teamFilter}
                onChange={(event) => {
                  setTeamFilter(event.target.value);
                  setCategoryFilter("");
                }}
                className={selectClass}
              >
                <option value="">All teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {teamLabels[team]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Category
              </span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={selectClass}
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <label
                htmlFor="catalog-item"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Add an item
              </label>
              <div className="flex gap-2">
                <select
                  id="catalog-item"
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">Choose an item</option>
                  {availableCatalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {teamLabels[item.team]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedItemId}
                  onClick={addItem}
                  className="rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {availableCatalog.length} catalog item(s) available to add
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-violet-50/70 text-xs font-bold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Team / category</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Unit price</th>
                {selectedNests.map((nest) => (
                  <th key={nest.id} className="px-3 py-3">
                    {nest.code} qty
                  </th>
                ))}
                <th className="px-4 py-3">Line total</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Remove item</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {planItems.map((item) => {
                const quantity = selectedNests.reduce(
                  (sum, nest) =>
                    sum + (item.quantities[nest.id] ?? 0),
                  0,
                );

                return (
                  <tr
                    key={item.id}
                    className="border-t border-slate-100 transition-colors hover:bg-violet-50/40"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">
                        {item.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {item.code}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-800">
                      {teamLabels[item.team]}
                      <p className="mt-1 text-xs text-slate-500">
                        {item.category ?? "Unassigned"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.uom}</td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {item.unitCost === null
                        ? "Price not set"
                        : formatMoney(item.unitCost, currency)}
                    </td>

                    {selectedNests.map((nest) => (
                      <td key={nest.id} className="px-3 py-4">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantities[nest.id] ?? ""}
                          onChange={(event) =>
                            updateQuantity(
                              item.id,
                              nest.id,
                              event.target.value,
                            )
                          }
                          aria-label={`${item.name} quantity for ${nest.code}`}
                          className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                        />
                      </td>
                    ))}

                    <td className="px-4 py-4 font-bold text-slate-950">
                      {formatMoney(quantity * (item.unitCost ?? 0), currency)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-400 transition hover:bg-red-50 hover:text-red-700"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!planItems.length && (
                <tr>
                  <td
                    colSpan={6 + selectedNests.length}
                    className="px-4 py-12 text-center"
                  >
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl text-violet-900">
                      +
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-900">
                      No items in this plan yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Choose items from the master catalogue above to build the
                      plan.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs leading-5 text-slate-600">
          Blank quantities exclude an item from that nest. Plan quantities do
          not change current stock.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-900">
              ∑
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-800">
                Cost breakdown
              </p>
              <h2 className="mt-1 font-bold text-slate-950">
                Plan cost by team
              </h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {teamTotals.map(({ team, total }) => (
              <div
                key={team}
                className="flex justify-between gap-4 text-sm text-slate-700"
              >
                <span>{teamLabels[team]}</span>
                <strong className="text-slate-950">
                  {formatMoney(total, currency)}
                </strong>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-violet-100 pt-3 font-bold text-slate-950">
              <span>Total plan cost</span>
              <span>{formatMoney(planTotal, currency)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 font-bold text-indigo-900">
              ⌖
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-800">
                Distribution breakdown
              </p>
              <h2 className="mt-1 font-bold text-slate-950">
                Plan cost by nest
              </h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {nestTotals.map(({ nest, total }) => (
              <div
                key={nest.id}
                className="flex justify-between gap-4 text-sm text-slate-700"
              >
                <span>{nest.code}</span>
                <strong className="text-slate-950">
                  {formatMoney(total, currency)}
                </strong>
              </div>
            ))}
            {nestTotals.length === 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                Select at least one nest to calculate the plan.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col justify-between gap-5 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
            Ready for review
          </p>
          <h2 className="mt-1 font-bold text-slate-950">Review and submit</h2>
          <p className="mt-1 text-sm text-slate-700">
            {planName || "Unnamed plan"} · {period || "No period"} ·{" "}
            {activeNestIds.length} nests · {formatMoney(planTotal, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {planId ? `Saved plan ${planId}` : "Not saved yet"} ·{" "}
            {status.replaceAll("_", " ")}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save("draft")}
            className="h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={
              saving ||
              loading ||
              activeNestIds.length === 0 ||
              planItems.length === 0
            }
            onClick={() => void save("submit")}
            className="h-11 rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Submit for finance review"}
          </button>
        </div>
      </section>
    </div>
  );
}