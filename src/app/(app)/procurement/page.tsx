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

const ITEMS_PER_PAGE = 40;

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
  const [catalogPage, setCatalogPage] = useState(1);
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
    () => [...new Set(items.map((item) => item.category || "Unassigned"))].sort(),
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

  useEffect(() => {
    setCatalogPage(1);
  }, [search, teamFilter, categoryFilter, nestId]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE),
  );
  const pageStart = (catalogPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filteredItems.slice(pageStart, pageStart + ITEMS_PER_PAGE);
  const firstVisibleItem = filteredItems.length === 0 ? 0 : pageStart + 1;
  const lastVisibleItem = Math.min(
    pageStart + ITEMS_PER_PAGE,
    filteredItems.length,
  );

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
      category:
        newItem.team === "facilities"
          ? newItem.category.trim() || "Unassigned"
          : null,
      uom: newItem.unit.trim(),
      unitCost,
      currencyCode: currency,
      quantity: null,
      updatedAt: null,
    };

    setOrderLines((current) => [
      ...current.filter((line) => line.itemId !== createdItem.id),
      {
        itemId: createdItem.id,
        item: createdItem,
        quantity,
        unitCost: String(unitCost),
      },
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

    const invalidLine = orderLines.find(
      (line) =>
        !Number.isInteger(Number(line.quantity)) ||
        Number(line.quantity) <= 0 ||
        line.unitCost.trim() === "" ||
        !Number.isFinite(Number(line.unitCost)) ||
        Number(line.unitCost) < 0,
    );

    if (invalidLine) {
      setNotice(
        `Enter a valid quantity and purchase price for ${invalidLine.item.name}.`,
      );
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

    setNotice(
      `${result.purchase.reference} was submitted for Quartermaster receipt acknowledgment.`,
    );
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

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  const selectClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-100 via-white to-white p-6 shadow-sm sm:flex sm:items-end sm:justify-between sm:gap-6 sm:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-100/80 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-800">
            Procurement workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Purchase for a location
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Search the catalog, add existing or new items to the cart, set
            purchase quantities and prices, and submit them for receipt at the
            selected nest.
          </p>
        </div>

        <label className="relative mt-5 grid w-full gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 sm:mt-0 sm:w-72">
          Select nest
          <select
            value={nestId}
            onChange={(event) => changeNest(event.target.value)}
            className={selectClass}
          >
            {(data?.nests ?? []).map((nest) => (
              <option key={nest.id} value={nest.id}>
                {nest.code} — {nest.name}
              </option>
            ))}
          </select>
        </label>
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

      <section className="flex flex-col gap-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xl text-violet-900">
          ⌖
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
            Purchase destination
          </p>
          <h2 className="mt-1 font-bold text-slate-950">
            {data?.selectedNest.code} · {data?.selectedNest.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Purchase prices are captured per order in {currency}.
          </p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 sm:ml-auto">
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">
              Item library
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
              Master catalog
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Browse active items, set catalog prices, and add quantities to
              the purchase cart for this nest.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900 shadow-sm">
              {loading ? "Loading items…" : `${filteredItems.length} catalog items`}
            </p>

            <form
              onSubmit={addCatalogItem}
              className="mt-5 grid gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm md:grid-cols-6"
            >
              <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">
                Item name
                <input
                  required
                  placeholder="Enter item name"
                  value={newItem.name}
                  onChange={(event) =>
                    setNewItem({ ...newItem, name: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Item code
                <input
                  placeholder="Optional"
                  value={newItem.code}
                  onChange={(event) =>
                    setNewItem({ ...newItem, code: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Team
                <select
                  value={newItem.team}
                  onChange={(event) =>
                    setNewItem({
                      ...newItem,
                      team: event.target.value as Team,
                    })
                  }
                  className={selectClass}
                >
                  <option value="flight">Flight</option>
                  <option value="fulfilment">Fulfilment</option>
                  <option value="facilities">Facilities</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Unit
                <input
                  required
                  placeholder="Pieces"
                  value={newItem.unit}
                  onChange={(event) =>
                    setNewItem({ ...newItem, unit: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Price ({currency})
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.unitCost}
                  onChange={(event) =>
                    setNewItem({ ...newItem, unitCost: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Quantity
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Whole number"
                  value={newItem.quantity}
                  onChange={(event) =>
                    setNewItem({ ...newItem, quantity: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              {newItem.team === "facilities" && (
                <label className="grid gap-1 text-xs font-semibold text-slate-700 md:col-span-2">
                  Facilities category
                  <input
                    placeholder="Enter a category"
                    value={newItem.category}
                    onChange={(event) =>
                      setNewItem({ ...newItem, category: event.target.value })
                    }
                    className={inputClass}
                  />
                </label>
              )}
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-violet-800 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-200"
              >
                Add item
              </button>
            </form>

            <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-[minmax(220px,1fr)_170px_210px]">
              <label>
                <span className="sr-only">Search catalog</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, code, team, category..."
                  className={inputClass}
                />
              </label>
              <label>
                <span className="sr-only">Filter by team</span>
                <select
                  value={teamFilter}
                  onChange={(event) => {
                    setTeamFilter(event.target.value);
                    setCategoryFilter("");
                  }}
                  className={selectClass}
                >
                  <option value="">All teams</option>
                  <option value="flight">Flight</option>
                  <option value="fulfilment">Fulfilment</option>
                  <option value="facilities">Facilities</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3 bg-slate-50/70 p-4 sm:p-5">
            {pageItems.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md sm:p-5"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-bold text-slate-950">
                          {item.name}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {item.code || "No item code"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          item.quantity === null
                            ? "bg-slate-100 text-slate-700"
                            : item.quantity <= 0
                              ? "bg-rose-50 text-rose-800"
                              : "bg-violet-50 text-violet-900"
                        }`}
                      >
                        {item.quantity === null
                          ? "Not tracked here"
                          : item.quantity <= 0
                            ? "Out of stock"
                            : `${item.quantity.toLocaleString()} ${item.uom} in stock`}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-900">
                        {teamLabels[item.team]}
                      </span>
                      <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-900">
                        {item.category ?? "Unassigned"}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                        Unit: {item.uom}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Current catalog price:{" "}
                      <span className="font-bold text-slate-950">
                        {formatMoney(item.unitCost, item.currencyCode)}
                      </span>
                    </p>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                      Update catalog price ({item.currencyCode})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={
                          item.unitCost === null
                            ? "Enter unit price"
                            : String(item.unitCost)
                        }
                        value={priceDrafts[item.id] ?? ""}
                        onChange={(event) =>
                          setPriceDrafts({
                            ...priceDrafts,
                            [item.id]: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <div className="flex gap-2 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => void updatePrice(item)}
                        className="min-h-11 flex-1 rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold text-violet-900 transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100 sm:flex-none"
                      >
                        Save price
                      </button>
                      <button
                        type="button"
                        onClick={() => addToOrder(item)}
                        className="min-h-11 flex-1 rounded-xl bg-violet-800 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-200 sm:flex-none"
                      >
                        Add to cart
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!loading && filteredItems.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <p className="text-base font-semibold text-slate-900">
                  No catalog items found
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Try another search or clear one of the filters.
                </p>
              </div>
            )}

            {loading && (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm font-medium text-slate-600">
                Loading catalog items…
              </div>
            )}
          </div>

          {filteredItems.length > 0 && (
            <nav
              aria-label="Catalog item pages"
              className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <p className="text-sm text-slate-600">
                Showing{" "}
                <span className="font-bold text-slate-950">
                  {firstVisibleItem}–{lastVisibleItem}
                </span>{" "}
                of{" "}
                <span className="font-bold text-slate-950">
                  {filteredItems.length}
                </span>{" "}
                items
              </p>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <button
                  type="button"
                  aria-label="Previous catalog page"
                  onClick={() =>
                    setCatalogPage((page) => Math.max(1, page - 1))
                  }
                  disabled={catalogPage <= 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-xl font-bold text-violet-900 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
                  Page {catalogPage} of {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next catalog page"
                  onClick={() =>
                    setCatalogPage((page) => Math.min(pageCount, page + 1))
                  }
                  disabled={catalogPage >= pageCount}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-xl font-bold text-violet-900 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </nav>
          )}

          <p className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs leading-5 text-slate-600">
            Catalog prices are saved to app_items as defaults. Each cart price
            is saved as a purchase snapshot for Finance.
          </p>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-5">
          <section className="overflow-hidden rounded-2xl border-2 border-violet-300 bg-white shadow-xl shadow-violet-950/10 ring-4 ring-violet-50">
            <div className="flex items-center justify-between border-b border-violet-900 bg-violet-900 p-5 text-white">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Purchase cart
                </h2>
                <p className="mt-1 text-xs text-violet-100">
                  Deliver to {data?.selectedNest.code}
                </p>
              </div>
              {orderLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOrderLines([])}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-violet-50 transition hover:bg-violet-800"
                >
                  Clear cart
                </button>
              )}
            </div>

            {orderLines.length === 0 ? (
              <p className="m-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-5 py-10 text-center text-sm leading-6 text-slate-600">
                Add items from the catalog. Enter a purchase price and quantity
                before submitting.
              </p>
            ) : (
              <div className="space-y-3 p-4">
                {orderLines.map(({ item, quantity, unitCost }) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-bold text-slate-950">
                        {item.name}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setOrderLines((current) =>
                            current.filter((line) => line.itemId !== item.id),
                          )
                        }
                        aria-label={`Remove ${item.name}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-800"
                      >
                        ×
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {teamLabels[item.team]} · {item.uom}
                    </p>
                    <label className="mt-3 grid gap-1.5 text-xs font-semibold text-slate-700">
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
                        className={inputClass}
                      />
                    </label>
                    <label className="mt-3 grid gap-1.5 text-xs font-semibold text-slate-700">
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
                        className={inputClass}
                      />
                    </label>
                    <p className="mt-3 text-right text-xs text-slate-600">
                      Line total:{" "}
                      <strong className="text-slate-950">
                        {formatMoney(
                          (Number(unitCost) || 0) * quantity,
                          currency,
                        )}
                      </strong>
                    </p>
                  </div>
                ))}

                <div className="flex justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-base font-bold text-violet-950">
                  <span>Draft total</span>
                  <span>{formatMoney(orderTotal, currency)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void submitOrder()}
                  disabled={loading || orderLines.length === 0}
                  className="w-full rounded-xl bg-violet-800 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-900/15 transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  Submit purchase for receipt
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
                  Activity
                </p>
                <h2 className="mt-1 font-bold text-slate-950">
                  Recent requests
                </h2>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-900">
                {(data?.recentRequests ?? []).length}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {(data?.recentRequests ?? []).map((purchase) => (
                <div
                  key={purchase.request_id}
                  className="flex justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm"
                >
                  <span className="font-semibold text-slate-900">
                    {purchase.reference}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                    {purchase.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
              {!data?.recentRequests.length && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </article>
  );
}