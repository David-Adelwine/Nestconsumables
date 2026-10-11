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
      [
        ...new Set(
          items.map((item) => item.category || "Unassigned"),
        ),
      ].sort(),
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            PROCUREMENT
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Stock plan
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Build a plan from the Supabase catalog and set quantities for each
            accessible nest.
          </p>
        </div>
        <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
          {status.replaceAll("_", " ")}
        </span>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Plan details</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold">Plan name</span>
              <input
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                className="h-10 w-full rounded-lg border px-3 text-sm"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold">Country</span>
              <select
                value={country}
                onChange={(event) => void load(event.target.value)}
                className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                {(data?.countries ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold">Frequency</span>
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(
                    event.target.value as "monthly" | "quarterly",
                  )
                }
                className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold">Period</span>
              <input
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder={currentQuarter()}
                className="h-10 w-full rounded-lg border px-3 text-sm"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold">Currency</span>
              <input
                value={currency}
                readOnly
                className="h-10 w-full rounded-lg border bg-gray-50 px-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Nests included</h2>
              <p className="mt-1 text-xs text-gray-500">
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
              className="text-xs font-semibold text-emerald-700"
            >
              {activeNestIds.length === nests.length ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {nests.map((nest) => (
              <label
                key={nest.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={activeNestIds.includes(nest.id)}
                  onChange={() => toggleNest(nest.id)}
                  className="accent-emerald-700"
                />
                {nest.code}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <div>
              <h2 className="font-semibold">Add from catalog</h2>
              <p className="mt-1 text-sm text-gray-500">
                Catalog, filters, and prices are loaded from Supabase.
              </p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search catalog"
              className="h-10 rounded-lg border px-3 text-sm"
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              value={teamFilter}
              onChange={(event) => {
                setTeamFilter(event.target.value);
                setCategoryFilter("");
              }}
              className="h-10 rounded-lg border bg-white px-3 text-sm"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {teamLabels[team]}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-10 rounded-lg border bg-white px-3 text-sm"
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <select
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm"
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
                className="rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:bg-gray-300"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
                <th />
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
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-4">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {item.code}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {teamLabels[item.team]}
                      <p className="mt-1 text-xs text-gray-500">
                        {item.category ?? "Unassigned"}
                      </p>
                    </td>
                    <td className="px-4 py-4">{item.uom}</td>
                    <td className="px-4 py-4">
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
                          className="h-9 w-20 rounded border px-2"
                        />
                      </td>
                    ))}

                    <td className="px-4 py-4 font-semibold">
                      {formatMoney(quantity * (item.unitCost ?? 0), currency)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="text-lg text-gray-400 hover:text-red-700"
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
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    Add items from the catalog to build the plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="border-t px-5 py-3 text-xs text-gray-500">
          Blank quantities exclude an item from that nest. Plan quantities do
          not change current stock.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Plan cost by team</h2>
          <div className="mt-4 space-y-3">
            {teamTotals.map(({ team, total }) => (
              <div key={team} className="flex justify-between text-sm">
                <span>{teamLabels[team]}</span>
                <strong>{formatMoney(total, currency)}</strong>
              </div>
            ))}
            <div className="flex justify-between border-t pt-3 font-bold">
              <span>Total plan cost</span>
              <span>{formatMoney(planTotal, currency)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Plan cost by nest</h2>
          <div className="mt-4 space-y-3">
            {nestTotals.map(({ nest, total }) => (
              <div key={nest.id} className="flex justify-between text-sm">
                <span>{nest.code}</span>
                <strong>{formatMoney(total, currency)}</strong>
              </div>
            ))}
            {nestTotals.length === 0 && (
              <p className="text-sm text-amber-800">
                Select at least one nest to calculate the plan.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-xl border bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Review and submit</h2>
          <p className="mt-1 text-sm text-gray-500">
            {planName || "Unnamed plan"} · {period || "No period"} ·{" "}
            {activeNestIds.length} nests · {formatMoney(planTotal, currency)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {planId ? `Saved plan ${planId}` : "Not saved yet"} ·{" "}
            {status.replaceAll("_", " ")}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save("draft")}
            className="h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
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
            className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-gray-300"
          >
            {saving ? "Saving…" : "Submit for finance review"}
          </button>
        </div>
      </section>
    </div>
  );
}