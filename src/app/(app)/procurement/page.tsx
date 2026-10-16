"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AccessRequestQueue } from "@/components/access/AccessRequestQueue";

type Team = "flight" | "fulfilment" | "facilities";

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  team: Team;
  category: string | null;
  uom: string;
  unitCost: number | null;
  currencyCode: string;
  quantity: number | null;
  updatedAt: string | null;
};

type Nest = {
  id: string;
  code: string;
  name: string;
  country: string | null;
};

type OrderLine = {
  itemId: string;
  item: CatalogItem;
  quantity: number;
  unitCost: string;
};

type DashboardData = {
  nests: Nest[];
  selectedNest: Nest;
  currencyCode: string;
  items: CatalogItem[];
  recentRequests: Array<{
    request_id: string;
    reference: string;
    status: string;
    created_at: string;
  }>;
};

const teamLabels: Record<Team, string> = {
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

function formatMoney(amount: number | null, currency: string) {
  if (amount === null) return "Price not set";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ProcurementPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [nestId, setNestId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [newItem, setNewItem] = useState({
    code: "",
    name: "",
    team: "facilities" as Team,
    category: "",
    unit: "Pieces",
    unitCost: "",
    quantity: "1",
  });

  async function load(nextNestId = "") {
    setLoading(true);
    setError("");

    try {
      const query = nextNestId
        ? `?nestId=${encodeURIComponent(nextNestId)}`
        : "";
      const response = await fetch(`/api/procurement/dashboard${query}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to load procurement data.");
      }

      setData(result as DashboardData);
      setNestId(result.selectedNest.id);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load procurement data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  const items = data?.items ?? [];
  const currency = data?.currencyCode ?? "GHS";

  const categories = useMemo(
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
      const matchesTeam = !teamFilter || item.team === teamFilter;
      const matchesCategory =
        !categoryFilter ||
        (item.category || "Unassigned") === categoryFilter;
      const text = [
        item.code,
        item.name,
        teamLabels[item.team],
        item.category ?? "Unassigned",
        item.uom,
      ]
        .join(" ")
        .toLowerCase();

      return matchesTeam && matchesCategory && (!query || text.includes(query));
    });
  }, [items, search, teamFilter, categoryFilter]);

  const orderTotal = orderLines.reduce(
    (sum, line) =>
      sum + (Number(line.unitCost) || 0) * (Number(line.quantity) || 0),
    0,
  );

  function addToOrder(item: CatalogItem) {
    setOrderLines((current) => {
      const existing = current.find((line) => line.itemId === item.id);

      if (existing) {
        return current.map((line) =>
          line.itemId === item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }

      return [
        ...current,
        {
          itemId: item.id,
          item,
          quantity: 1,
          unitCost: item.unitCost === null ? "" : String(item.unitCost),
        },
      ];
    });
    setNotice(`${item.name} added to the purchase cart.`);
  }

  async function updatePrice(item: CatalogItem) {
    const unitCost = Number(priceDrafts[item.id]);

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setNotice("Enter a valid price of zero or greater.");
      return;
    }

    const response = await fetch("/api/procurement/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_price",
        nestId,
        itemId: item.id,
        unitCost,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setNotice(result.error ?? "Price could not be updated.");
      return;
    }

    setNotice(`Price updated for ${item.name}.`);
    await load(nestId);
  }

  async function addCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(newItem.quantity);
    const unitCost = Number(newItem.unitCost);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setNotice("Enter a whole-number purchase quantity of at least 1.");
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setNotice("Enter a purchase price of zero or greater.");
      return;
    }

    const response = await fetch("/api/procurement/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_item",
        nestId,
        ...newItem,
        unitCost,
        quantity,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setNotice(result.error ?? "The item could not be added.");
      return;
    }

    const createdItem: CatalogItem = {
      id: result.itemId,
      code: result.itemCode ?? newItem.code,
      name: newItem.name.trim(),
      team: newItem.team,
      category: newItem.team === "facilities" ? newItem.category.trim() || "Unassigned" : null,
      uom: newItem.unit.trim(),
      unitCost,
      currencyCode: currency,
      quantity: null,
      updatedAt: null,
    };
    setOrderLines((current) => [
      ...current.filter((line) => line.itemId !== createdItem.id),
      { itemId: createdItem.id, item: createdItem, quantity, unitCost: String(unitCost) },
    ]);
    setNewItem({
      code: "",
      name: "",
      team: "facilities",
      category: "",
      unit: "Pieces",
      unitCost: "",
      quantity: "1",
    });
    setNotice(`${createdItem.name} was added to the catalog and purchase cart.`);
    await load(nestId);
  }

  async function submitOrder() {
    if (orderLines.length === 0) return;
    const invalidLine = orderLines.find((line) =>
      !Number.isInteger(Number(line.quantity)) ||
      Number(line.quantity) <= 0 ||
      line.unitCost.trim() === "" ||
      !Number.isFinite(Number(line.unitCost)) ||
      Number(line.unitCost) < 0,
    );
    if (invalidLine) {
      setNotice(`Enter a valid quantity and purchase price for ${invalidLine.item.name}.`);
      return;
    }

    const response = await fetch("/api/procurement/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_order",
        nestId,
        lines: orderLines.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setNotice(
        result.error ?? "The purchase request could not be submitted.",
      );
      return;
    }

    setNotice(`${result.purchase.reference} was submitted for Quartermaster receipt acknowledgment.`);
    setOrderLines([]);
    await load(nestId);
  }

  function changeNest(nextNestId: string) {
    setOrderLines([]);
    setNestId(nextNestId);
    setTeamFilter("");
    setCategoryFilter("");
    setSearch("");
    void load(nextNestId);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            PROCUREMENT
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Purchase for a location
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Search the catalog, add existing or new items to the cart, set purchase quantities and prices, and submit them for receipt at the selected nest.
          </p>
        </div>

        <label className="grid gap-1.5 text-xs font-medium text-gray-600">
          Select nest
          <select
            value={nestId}
            onChange={(event) => changeNest(event.target.value)}
            className="h-10 min-w-64 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
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

      <section className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-xl text-emerald-800">
          ⌖
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Purchase destination
          </p>
          <h2 className="mt-1 font-semibold text-gray-900">
            {data?.selectedNest.code} · {data?.selectedNest.name}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Purchase prices are captured per order in {currency}.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-amber-800 sm:ml-auto">
          Stock updates after receipt
        </span>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Catalog items"
          value={loading ? "…" : items.length}
          detail="Active items in this country"
        />
        <SummaryCard
          label="Items tracked here"
          value={items.filter((item) => item.quantity !== null).length}
          detail={`Stock records at ${data?.selectedNest.code ?? "selected nest"}`}
        />
        <SummaryCard
          label="Purchase cart"
          value={formatMoney(orderTotal, currency)}
          detail={`${orderLines.length} items in the cart`}
        />
      </section>


      <AccessRequestQueue
  title="Quartermaster access requests"
  description="Review Quartermaster requests within your assigned country or nest access."
/>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(350px,0.85fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900">
              Master catalog
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Catalog and stock values are loaded from Supabase.
            </p>

            <form
              onSubmit={addCatalogItem}
              className="mt-4 grid gap-2 md:grid-cols-6"
            >
              <input
                required
                placeholder="Item name"
                value={newItem.name}
                onChange={(event) =>
                  setNewItem({ ...newItem, name: event.target.value })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 md:col-span-2 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <input
                placeholder="Item code (optional)"
                value={newItem.code}
                onChange={(event) =>
                  setNewItem({ ...newItem, code: event.target.value })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <select
                value={newItem.team}
                onChange={(event) =>
                  setNewItem({
                    ...newItem,
                    team: event.target.value as Team,
                  })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="flight">Flight</option>
                <option value="fulfilment">Fulfilment</option>
                <option value="facilities">Facilities</option>
              </select>
              <input
                required
                placeholder="Unit"
                value={newItem.unit}
                onChange={(event) =>
                  setNewItem({ ...newItem, unit: event.target.value })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder={`Purchase price (${currency})`}
                value={newItem.unitCost}
                onChange={(event) =>
                  setNewItem({ ...newItem, unitCost: event.target.value })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <input
                required
                type="number"
                min="1"
                step="1"
                placeholder="Whole-number quantity"
                value={newItem.quantity}
                onChange={(event) =>
                  setNewItem({ ...newItem, quantity: event.target.value })
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              {newItem.team === "facilities" && (
                <input
                  placeholder="Facilities category"
                  value={newItem.category}
                  onChange={(event) =>
                    setNewItem({ ...newItem, category: event.target.value })
                  }
                  className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 md:col-span-2 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              )}
              <button
                type="submit"
                className="rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white"
              >
                Add item
              </button>
            </form>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_170px_210px]">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, code, team, category..."
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <select
                value={teamFilter}
                onChange={(event) => {
                  setTeamFilter(event.target.value);
                  setCategoryFilter("");
                }}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">All teams</option>
                <option value="flight">Flight</option>
                <option value="fulfilment">Fulfilment</option>
                <option value="facilities">Facilities</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Team / category</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Stock here</th>
                  <th className="px-4 py-3">Unit price</th>
                  <th className="px-4 py-3">Order</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {item.code}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p>{teamLabels[item.team]}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.category ?? "Unassigned"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{item.uom}</td>
                    <td className="px-4 py-4">
                      {item.quantity === null
                        ? "Not tracked here"
                        : `${item.quantity.toLocaleString()} ${item.uom}`}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={
                            item.unitCost === null
                              ? "Unset"
                              : String(item.unitCost)
                          }
                          value={priceDrafts[item.id] ?? ""}
                          onChange={(event) =>
                            setPriceDrafts({
                              ...priceDrafts,
                              [item.id]: event.target.value,
                            })
                          }
                          className="h-9 w-24 rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />
                        <button
                          type="button"
                          onClick={() => void updatePrice(item)}
                          className="text-xs font-semibold text-emerald-700"
                        >
                          Save catalog price
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatMoney(item.unitCost, item.currencyCode)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => addToOrder(item)}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Add to cart
                      </button>
                    </td>
                  </tr>
                ))}

                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-gray-500"
                    >
                      No catalog items match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="border-t px-5 py-3 text-xs text-gray-500">
            Catalog prices are saved to app_items as defaults. Each cart price is saved as a purchase snapshot for Finance.
          </p>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-semibold">Purchase cart</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Deliver to {data?.selectedNest.code}
                </p>
              </div>
              {orderLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOrderLines([])}
                  className="text-xs font-semibold text-gray-500"
                >
                  Clear
                </button>
              )}
            </div>

            {orderLines.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-500">
                Add items from the catalog. Enter a purchase price and quantity before submitting.
              </p>
            ) : (
              <div className="space-y-3 p-4">
                {orderLines.map(({ item, quantity, unitCost }) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setOrderLines((current) =>
                            current.filter((line) => line.itemId !== item.id),
                          )
                        }
                        aria-label={`Remove ${item.name}`}
                      >
                        ×
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {teamLabels[item.team]} · {item.uom}
                    </p>
                    <label className="mt-3 grid gap-1 text-xs font-medium text-gray-700">
                      Purchase price ({currency})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitCost}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((line) =>
                              line.itemId === item.id
                                ? { ...line, unitCost: event.target.value }
                                : line,
                            ),
                          )
                        }
                        className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>
                    <label className="mt-2 grid gap-1 text-xs font-medium text-gray-700">
                      Quantity ({item.uom})
                      <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(event) =>
                        setOrderLines((current) =>
                          current.map((line) =>
                            line.itemId === item.id
                              ? {
                                  ...line,
                                  quantity: Number(event.target.value),
                                }
                              : line,
                          ),
                        )
                      }
                        className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>
                    <p className="mt-2 text-right text-xs text-gray-500">
                      Line total: {formatMoney((Number(unitCost) || 0) * quantity, currency)}
                    </p>
                  </div>
                ))}

                <div className="flex justify-between border-t pt-3 font-bold">
                  <span>Draft total</span>
                  <span>{formatMoney(orderTotal, currency)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void submitOrder()}
                  disabled={loading || orderLines.length === 0}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Submit purchase for receipt
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold">Recent requests</h2>
            <div className="mt-3 space-y-2">
              {(data?.recentRequests ?? []).map((purchase) => (
                <div
                  key={purchase.request_id}
                  className="flex justify-between gap-3 border-t pt-2 text-sm"
                >
                  <span>{purchase.reference}</span>
                  <span className="text-gray-500">
                    {purchase.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
              {!data?.recentRequests.length && (
                <p className="text-sm text-gray-500">
                  No requests recorded for this nest.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </article>
  );
}