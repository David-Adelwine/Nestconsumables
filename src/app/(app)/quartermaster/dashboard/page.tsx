"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type Team = "flight" | "fulfilment" | "facilities";
type TeamFilter = Team | "";

type NestOption = {
  nestId: string;
  code: string;
  name: string;
  country: string | null;
};

type CatalogItem = {
  id: string;
  code: string | null;
  name: string;
  team: Team;
  category: string | null;
  uom: string;
  stockQuantity: number | null;
  stockUnit: string | null;
  stockUpdatedAt: string | null;
};

type PendingReceipt = {
  lineId: string;
  requestId: string;
  reference: string;
  status: string;
  createdAt: string;
  itemId: string;
  itemName: string;
  itemCode: string | null;
  team: string;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
};

type DashboardData = {
  assignedNest: NestOption;
  availableNests: NestOption[];
  allowedTeams: Team[];
  categories: string[];
  items: CatalogItem[];
  pendingReceipts: PendingReceipt[];
};

type ApiResult = {
  error?: string;
  remainingQuantity?: number;
  acknowledgedCount?: number;
  success?: boolean;
};

const teams: Team[] = ["flight", "fulfilment", "facilities"];

const teamLabels: Record<Team, string> = {
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

function normalizeTeam(value: unknown): Team | null {
  const team = String(value ?? "").trim().toLowerCase();
  return teams.includes(team as Team) ? (team as Team) : null;
}

function displayTeam(team: Team) {
  return teamLabels[team];
}

function getAvailableQuantity(item: CatalogItem) {
  return item.stockQuantity === null ? 0 : Number(item.stockQuantity);
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getReceiptQuantityMessage(
  line: PendingReceipt,
  rawQuantity: string,
  nestCode: string,
): { kind: "error" | "info"; text: string } | null {
  if (rawQuantity.trim() === "") return null;

  const quantity = Number(rawQuantity);

  if (!Number.isSafeInteger(quantity)) {
    return {
      kind: "error",
      text: "Enter a whole-number quantity. Fractional receipts are not allowed.",
    };
  }

  if (quantity <= 0) {
    return {
      kind: "error",
      text: `Enter at least 1 ${line.unit} for ${line.itemName}.`,
    };
  }

  if (quantity > line.pendingQuantity) {
    const excess = quantity - line.pendingQuantity;

    return {
      kind: "error",
      text: `You're receiving ${excess} ${line.unit} more than the ${line.pendingQuantity} ${line.unit} still expected for ${line.itemName} at ${nestCode}. You can receive up to ${line.pendingQuantity} ${line.unit}.`,
    };
  }

  if (quantity < line.pendingQuantity) {
    const remaining = line.pendingQuantity - quantity;

    return {
      kind: "info",
      text: `You're receiving ${quantity} of the ${line.pendingQuantity} ${line.unit} still expected. The remaining ${remaining} ${line.unit} will stay on this manifest for later receipt.`,
    };
  }

  return null;
}

export default function QuartermasterDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedNestId, setSelectedNestId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeSearch, setConsumeSearch] = useState("");
  const [consumeItemId, setConsumeItemId] = useState("");
  const [consumeQuantity, setConsumeQuantity] = useState("");
  const [consumeNote, setConsumeNote] = useState("");
  const [consumeError, setConsumeError] = useState("");
  const [consuming, setConsuming] = useState(false);

  const [categoryItem, setCategoryItem] = useState<CatalogItem | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [existingItemId, setExistingItemId] = useState("");

  const [receiptQuantities, setReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [verifiedReceiptRequests, setVerifiedReceiptRequests] = useState<
    Record<string, boolean>
  >({});
  const [receiptErrors, setReceiptErrors] = useState<Record<string, string>>(
    {},
  );
  const [receivingRequestId, setReceivingRequestId] = useState("");

  const [newItem, setNewItem] = useState({
    name: "",
    code: "",
    team: "facilities" as Team,
    category: "",
    unit: "",
    quantity: "1",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (selectedNestId) params.set("nestId", selectedNestId);

        const query = params.toString();
        const response = await fetch(
          query ? `/api/qm/dashboard?${query}` : "/api/qm/dashboard",
          { cache: "no-store", signal: controller.signal },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to load dashboard.");
        }

        const data = result as DashboardData;

        data.items = data.items.flatMap((item) => {
          const team = normalizeTeam(item.team);
          if (!team) return [];

          return [
            {
              ...item,
              team,
              stockQuantity:
                item.stockQuantity === null
                  ? null
                  : Number(item.stockQuantity),
            },
          ];
        });

        setDashboard(data);

        if (!selectedNestId && data.assignedNest?.nestId) {
          setSelectedNestId(data.assignedNest.nestId);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load dashboard.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [selectedNestId, refreshKey]);

  const catalogItems = dashboard?.items ?? [];
  const assignedLocation = dashboard?.assignedNest;
  const availableNests = dashboard?.availableNests ?? [];
  const allowedTeams = dashboard?.allowedTeams ?? teams;
  const nestCode = assignedLocation?.code ?? "this nest";

  const receiptRequests = useMemo(() => {
    const groups = new Map<string, PendingReceipt[]>();

    for (const receipt of dashboard?.pendingReceipts ?? []) {
      const current = groups.get(receipt.requestId) ?? [];
      current.push(receipt);
      groups.set(receipt.requestId, current);
    }

    return [...groups.entries()]
      .map(([requestId, lines]) => ({
        requestId,
        reference: lines[0]?.reference ?? "Purchase",
        status: lines[0]?.status ?? "ordered",
        createdAt: lines[0]?.createdAt ?? "",
        lines: [...lines].sort((a, b) =>
          a.itemName.localeCompare(b.itemName),
        ),
      }))
      .filter((purchase) =>
        purchase.lines.some((line) => line.pendingQuantity > 0),
      );
  }, [dashboard?.pendingReceipts]);

  const pendingReceiptLineCount = (
    dashboard?.pendingReceipts ?? []
  ).filter((receipt) => receipt.pendingQuantity > 0).length;

  const availableItems = useMemo(
    () =>
      catalogItems.filter(
        (item) =>
          item.stockQuantity !== null &&
          Number.isFinite(Number(item.stockQuantity)) &&
          Number(item.stockQuantity) > 0,
      ),
    [catalogItems],
  );

  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          [
            ...(dashboard?.categories ?? []),
            ...catalogItems
              .map((item) => item.category?.trim())
              .filter((category): category is string => Boolean(category)),
          ],
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [dashboard?.categories, catalogItems],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return catalogItems.filter((item) => {
      const matchesTeam = !teamFilter || item.team === teamFilter;
      const itemCategory = item.category?.trim() || "Unassigned";
      const matchesCategory =
        !categoryFilter || itemCategory === categoryFilter;

      const searchable = [
        item.name,
        item.code ?? "",
        displayTeam(item.team),
        itemCategory,
        item.uom,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesTeam &&
        matchesCategory &&
        (!query || searchable.includes(query))
      );
    });
  }, [catalogItems, search, teamFilter, categoryFilter]);

  const consumeSuggestions = useMemo(() => {
    const query = consumeSearch.trim().toLowerCase();

    return availableItems
      .filter((item) => {
        if (!query) return true;

        const searchable = [
          item.name,
          item.code ?? "",
          displayTeam(item.team),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      })
      .slice(0, 8);
  }, [availableItems, consumeSearch]);

  const selectedConsumeItem =
    availableItems.find((item) => item.id === consumeItemId) ?? null;

  const addItemSuggestions = useMemo(() => {
    const query = newItem.name.trim().toLowerCase();

    if (!query || existingItemId) return [];

    return catalogItems
      .filter((item) =>
        `${item.name} ${item.code ?? ""}`.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [catalogItems, newItem.name, existingItemId]);

  const trackedCount = catalogItems.filter(
    (item) => item.stockQuantity !== null,
  ).length;

  const outOfStockCount = catalogItems.filter(
    (item) => item.stockQuantity !== null && Number(item.stockQuantity) <= 0,
  ).length;

  const teamDescription =
    allowedTeams.length === 3
      ? "all teams"
      : allowedTeams.map(displayTeam).join(", ");

  function openConsume(item?: CatalogItem) {
    setNotice("");
    setConsumeError("");
    setConsumeQuantity("");
    setConsumeNote("");
    setConsumeItemId(item?.id ?? "");
    setConsumeSearch(item?.name ?? "");
    setConsumeOpen(true);
  }

  function openCategory(item: CatalogItem) {
    setNotice("");
    setCategoryError("");
    setCategoryDraft(item.category ?? "");
    setCategoryItem(item);
  }

  function openAddItem() {
    setNotice("");
    setAddItemError("");
    setExistingItemId("");
    setNewItem({
      name: "",
      code: "",
      team: "facilities",
      category: "",
      unit: "",
      quantity: "1",
    });
    setAddItemOpen(true);
  }

  function chooseExistingItem(item: CatalogItem) {
    setExistingItemId(item.id);
    setNewItem((current) => ({
      ...current,
      name: item.name,
      code: item.code ?? "",
      team: item.team,
      category: item.category?.trim() ?? "",
      unit: item.uom,
    }));
  }

  async function postDashboardAction(body: Record<string, unknown>) {
    const response = await fetch("/api/qm/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, nestId: selectedNestId }),
    });

    const result = (await response.json()) as ApiResult;
    if (!response.ok) {
      throw new Error(result.error ?? "Unable to save the change.");
    }

    return result;
  }

  async function acknowledgePurchase(purchase: {
    requestId: string;
    reference: string;
    lines: PendingReceipt[];
  }) {
    const pendingLines = purchase.lines.filter(
      (line) => line.pendingQuantity > 0,
    );

    const quantities = pendingLines.map((line) => ({
      line,
      quantity: Number(
        receiptQuantities[line.lineId] ?? line.pendingQuantity,
      ),
    }));

    const fractionalBalance = pendingLines.find(
      (line) => !Number.isSafeInteger(line.pendingQuantity),
    );

    if (fractionalBalance) {
      setReceiptErrors((current) => ({
        ...current,
        [purchase.requestId]:
          "This purchase has a fractional remaining balance from an earlier entry. Ask an administrator to correct it before acknowledging receipt.",
      }));
      return;
    }

    const invalidLine = quantities.find(
      ({ line, quantity }) =>
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        quantity > line.pendingQuantity,
    );

    if (invalidLine) {
      const message = getReceiptQuantityMessage(
        invalidLine.line,
        String(receiptQuantities[invalidLine.line.lineId] ?? invalidLine.quantity),
        nestCode,
      );

      setReceiptErrors((current) => ({
        ...current,
        [purchase.requestId]:
          message?.text ??
          `Enter a valid whole-number quantity for ${invalidLine.line.itemName}.`,
      }));
      return;
    }

    setReceiptErrors((current) => {
      const next = { ...current };
      delete next[purchase.requestId];
      return next;
    });
    setNotice("");
    setReceivingRequestId(purchase.requestId);

    try {
      await postDashboardAction({
        action: "acknowledge_request_receipt",
        requestId: purchase.requestId,
        lines: quantities.map(({ line, quantity }) => ({
          lineId: line.lineId,
          quantity,
        })),
      });

      const receivedItems = quantities.map(
        ({ line, quantity }) =>
          `${quantity} ${line.unit} ${line.itemName}`,
      );

      const remainingItems = quantities.flatMap(({ line, quantity }) => {
        const remaining = line.pendingQuantity - quantity;
        return remaining > 0
          ? [`${remaining} ${line.unit} ${line.itemName}`]
          : [];
      });

      setNotice(
        remainingItems.length > 0
          ? `Receipt for ${purchase.reference} recorded: ${receivedItems.join(", ")}. The remaining quantities (${remainingItems.join(", ")}) are still on the manifest for later receipt.`
          : `Receipt for ${purchase.reference} recorded: ${receivedItems.join(", ")}. Inventory has been updated.`,
      );

      setReceiptQuantities((current) => {
        const next = { ...current };
        for (const { line } of quantities) delete next[line.lineId];
        return next;
      });

      setVerifiedReceiptRequests((current) => {
        const next = { ...current };
        delete next[purchase.requestId];
        return next;
      });

      setRefreshKey((value) => value + 1);
    } catch (receiveError) {
      setReceiptErrors((current) => ({
        ...current,
        [purchase.requestId]:
          receiveError instanceof Error
            ? receiveError.message
            : "Unable to acknowledge this purchase receipt.",
      }));
    } finally {
      setReceivingRequestId("");
    }
  }

  async function handleConsume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsumeError("");
    setNotice("");

    if (!selectedConsumeItem) {
      setConsumeError("Choose an available item.");
      return;
    }

    const quantity = Number(consumeQuantity);
    const availableQuantity = getAvailableQuantity(selectedConsumeItem);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setConsumeError("Enter a quantity greater than zero.");
      return;
    }

    if (quantity > availableQuantity) {
      setConsumeError(
        `Only ${availableQuantity} ${
          selectedConsumeItem.stockUnit ?? selectedConsumeItem.uom
        } is available.`,
      );
      return;
    }

    setConsuming(true);

    try {
      const response = await fetch("/api/qm/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nestId: selectedNestId,
          itemId: selectedConsumeItem.id,
          quantity,
          note: consumeNote.trim(),
        }),
      });

      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to record consumption.");
      }

      const itemName = selectedConsumeItem.name;
      const unit =
        selectedConsumeItem.stockUnit ?? selectedConsumeItem.uom;
      const remainingQuantity = Number(result.remainingQuantity);

      setConsumeOpen(false);
      setNotice(
        `${quantity} ${unit} of ${itemName} consumed. ${
          Number.isFinite(remainingQuantity)
            ? `${remainingQuantity} ${unit} remaining.`
            : "Stock updated."
        }`,
      );
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      setConsumeError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to record consumption.",
      );
    } finally {
      setConsuming(false);
    }
  }

  async function handleCategorySave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryItem) return;

    setSavingCategory(true);
    setCategoryError("");

    try {
      await postDashboardAction({
        action: "update_category",
        itemId: categoryItem.id,
        category: categoryDraft,
      });

      setCategoryItem(null);
      setNotice(
        `Category saved for ${categoryItem.name}. The category is shared across this country's catalog.`,
      );
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setCategoryError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update category.",
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingItem(true);
    setAddItemError("");

    try {
      await postDashboardAction({
        action: "add_item",
        existingItemId,
        name: newItem.name,
        code: newItem.code,
        team: newItem.team,
        category: newItem.category,
        unit: newItem.unit,
        quantity: newItem.quantity,
      });

      setAddItemOpen(false);
      setNotice(
        `${newItem.name.trim()} quantity was added at ${assignedLocation?.code ?? "this nest"}.`,
      );
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setAddItemError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add item.",
      );
    } finally {
      setSavingItem(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Quartermaster workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Item catalog and stock
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Review catalog items, record consumption, organize categories,
              and add stock at your assigned nest.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            {availableNests.length > 1 ? (
              <label className="w-full sm:w-64">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Assigned location
                </span>
                <select
                  value={selectedNestId}
                  onChange={(event) => {
                    setSelectedNestId(event.target.value);
                    setTeamFilter("");
                    setCategoryFilter("");
                    setNotice("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                >
                  {availableNests.map((nest) => (
                    <option key={nest.nestId} value={nest.nestId}>
                      {nest.code} · {nest.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="text-slate-500">Assigned location </span>
                <strong className="text-emerald-800">
                  {assignedLocation?.code ?? (loading ? "Loading…" : "—")}
                </strong>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        <section className="mt-7 flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-5 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl text-emerald-700">
            ⌖
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Your inventory location
            </p>
            <h2 className="mt-1 text-lg font-bold">
              {assignedLocation
                ? `${assignedLocation.code} · ${assignedLocation.name}`
                : loading
                  ? "Loading assigned location…"
                  : "No assigned location"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Team filters: {teamDescription || "all teams"}.
            </p>
          </div>
          <span className="w-fit rounded border border-emerald-100 bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-emerald-800 sm:ml-auto">
            LIVE SUPABASE DATA
          </span>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Catalog items"
            value={loading ? "—" : catalogItems.length}
            detail="Active items, including items without stock"
            icon="▤"
            iconClass="bg-emerald-50 text-emerald-700"
          />
          <SummaryCard
            label="Tracked items"
            value={loading ? "—" : trackedCount}
            detail="Items with a stock record at this nest"
            icon="✓"
            iconClass="bg-blue-50 text-blue-700"
          />
          <SummaryCard
            label="Out of stock"
            value={loading ? "—" : outOfStockCount}
            detail="Stocked items with a zero balance"
            icon="—"
            iconClass="bg-amber-50 text-amber-700"
          />
        </section>

        {receiptRequests.length > 0 && (
          <section className="mt-7 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Delivery review
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    Purchases awaiting receipt
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Review each request manifest and compare the listed items
                    and quantities with the delivery before confirming receipt.
                  </p>
                </div>
                <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                  {receiptRequests.length} request(s) ·{" "}
                  {pendingReceiptLineCount} item line(s) pending
                </span>
              </div>
            </div>

            {receiptRequests.map((purchase) => {
              const isVerified = Boolean(
                verifiedReceiptRequests[purchase.requestId],
              );
              const pendingLines = purchase.lines.filter(
                (line) => line.pendingQuantity > 0,
              );
              const hasFractionalPending = pendingLines.some(
                (line) => !Number.isSafeInteger(line.pendingQuantity),
              );

              return (
                <article
                  key={purchase.requestId}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <header className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          Delivery {purchase.reference}
                        </h3>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium capitalize text-amber-800">
                          {purchase.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {purchase.createdAt
                          ? `Sent ${formatUpdatedAt(purchase.createdAt)}`
                          : "Purchase delivery"}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {purchase.lines.length} manifest item(s) ·{" "}
                      {pendingLines.length} awaiting receipt
                    </span>
                  </header>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Item sent</th>
                          <th className="px-4 py-3">Ordered</th>
                          <th className="px-4 py-3">Received</th>
                          <th className="px-4 py-3">Still expected</th>
                          <th className="px-5 py-3">Quantity received now</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {purchase.lines.map((line) => {
                          const team = normalizeTeam(line.team);
                          const complete = line.pendingQuantity <= 0;
                          const fractional =
                            line.pendingQuantity > 0 &&
                            !Number.isSafeInteger(line.pendingQuantity);
                          const rawQuantity =
                            receiptQuantities[line.lineId] ??
                            String(line.pendingQuantity);
                          const feedback = fractional
                            ? null
                            : getReceiptQuantityMessage(
                                line,
                                rawQuantity,
                                nestCode,
                              );

                          return (
                            <tr key={line.lineId}>
                              <td className="px-5 py-4">
                                <p className="font-semibold text-slate-900">
                                  {line.itemName}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {line.itemCode ? `${line.itemCode} · ` : ""}
                                  {team ? displayTeam(team) : line.team}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-700">
                                {line.orderedQuantity} {line.unit}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                                {line.receivedQuantity} {line.unit}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4">
                                <span
                                  className={
                                    complete
                                      ? "text-emerald-700"
                                      : "font-semibold text-amber-800"
                                  }
                                >
                                  {line.pendingQuantity} {line.unit}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                {complete ? (
                                  <span className="text-sm font-medium text-emerald-700">
                                    Fully received
                                  </span>
                                ) : fractional ? (
                                  <span className="text-xs font-medium text-red-700">
                                    Fractional balance needs correction
                                  </span>
                                ) : (
                                  <div>
                                    <input
                                      type="number"
                                      min="1"
                                      max={line.pendingQuantity}
                                      step="1"
                                      inputMode="numeric"
                                      aria-label={`Quantity received now for ${line.itemName}`}
                                      aria-invalid={feedback?.kind === "error"}
                                      value={rawQuantity}
                                      onChange={(event) => {
                                        setReceiptQuantities((current) => ({
                                          ...current,
                                          [line.lineId]: event.target.value,
                                        }));
                                        setReceiptErrors((current) => {
                                          const next = { ...current };
                                          delete next[purchase.requestId];
                                          return next;
                                        });
                                      }}
                                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 sm:w-40"
                                    />
                                    {feedback && (
                                      <p
                                        className={`mt-1 max-w-xs text-xs ${
                                          feedback.kind === "error"
                                            ? "text-red-700"
                                            : "text-slate-600"
                                        }`}
                                      >
                                        {feedback.text}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {pendingLines.length > 0 && (
                    <label className="flex cursor-pointer items-start gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={isVerified}
                        onChange={(event) => {
                          setVerifiedReceiptRequests((current) => ({
                            ...current,
                            [purchase.requestId]: event.target.checked,
                          }));
                          setReceiptErrors((current) => {
                            const next = { ...current };
                            delete next[purchase.requestId];
                            return next;
                          });
                        }}
                        className="mt-0.5 h-4 w-4 accent-emerald-700"
                      />
                      <span>
                        <span className="block font-semibold text-slate-900">
                          I checked the delivery against this manifest.
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Review all listed quantities, then acknowledge this
                          receipt once.
                        </span>
                      </span>
                    </label>
                  )}

                  {pendingLines.length > 0 && (
                    <div className="flex flex-col justify-between gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-sm text-slate-600">
                          {pendingLines.length} item line(s) will be recorded
                          together for {purchase.reference}.
                        </p>
                        {hasFractionalPending && (
                          <p className="mt-1 text-xs font-medium text-red-700">
                            This request has a fractional remaining balance
                            from an earlier entry. Ask an administrator to
                            correct it before acknowledging receipt.
                          </p>
                        )}
                        {receiptErrors[purchase.requestId] && (
                          <p
                            role="alert"
                            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                          >
                            {receiptErrors[purchase.requestId]}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void acknowledgePurchase(purchase)}
                        disabled={
                          !isVerified ||
                          hasFractionalPending ||
                          Boolean(receivingRequestId)
                        }
                        className="h-11 shrink-0 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {receivingRequestId === purchase.requestId
                          ? "Recording receipt…"
                          : "Acknowledge all received items"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        <section className="mt-9 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-lg font-semibold">Inventory items</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Catalog items remain visible even if a stock balance has not
                  been recorded at this nest.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openAddItem}
                  className="h-10 rounded-lg border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  Add item and quantity
                </button>
                <button
                  type="button"
                  onClick={() => openConsume()}
                  disabled={availableItems.length === 0 || loading}
                  className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Consume an item
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_220px]">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400">
                <span aria-hidden="true" className="text-lg">
                  ⌕
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search catalog items..."
                  aria-label="Search catalog items"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </label>

              <label>
                <span className="sr-only">Filter by team</span>
                <select
                  value={teamFilter}
                  onChange={(event) =>
                    setTeamFilter(event.target.value as TeamFilter)
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="">All teams</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {displayTeam(team)}
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
                  {catalogItems.some((item) => !item.category?.trim()) && (
                    <option value="Unassigned">Unassigned</option>
                  )}
                </select>
              </label>
            </div>
          </div>

          {loading && !dashboard ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Loading catalog…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {error
                ? "Dashboard data could not be loaded."
                : "No catalog items match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <TableHeading>Item</TableHeading>
                    <TableHeading>Team</TableHeading>
                    <TableHeading>Category</TableHeading>
                    <TableHeading>UOM</TableHeading>
                    <TableHeading>
                      Quantity at {assignedLocation?.code ?? "this nest"}
                    </TableHeading>
                    <TableHeading>Last updated</TableHeading>
                    <TableHeading>Actions</TableHeading>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100 hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-800">
                          {item.name}
                        </p>
                        {item.code && (
                          <p className="mt-1 font-mono text-xs text-slate-400">
                            {item.code}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {displayTeam(item.team)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.category
                              ? "bg-slate-100 text-slate-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {item.category || "Unassigned"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {item.uom}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                        {item.stockQuantity === null
                          ? "Not recorded"
                          : Number(item.stockQuantity).toLocaleString()}
                        {item.stockQuantity !== null && (
                          <span className="ml-1 font-normal text-slate-500">
                            {item.stockUnit ?? item.uom}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">
                        {formatUpdatedAt(item.stockUpdatedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openCategory(item)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {item.category ? "Edit category" : "Categorize"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openConsume(item)}
                            disabled={getAvailableQuantity(item) <= 0}
                            className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Consume
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>
              Showing {filteredItems.length} of {catalogItems.length} catalog
              items.
            </span>
            <span>
              Consumption is available only for items with a positive balance.
            </span>
          </div>
        </section>
      </div>

      {consumeOpen && (
        <Modal
          title="Consume stock"
          subtitle={`${assignedLocation?.code ?? "Assigned nest"} · Record item usage`}
          onClose={() => !consuming && setConsumeOpen(false)}
        >
          <form onSubmit={handleConsume}>
            <label className="mb-2 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Find item
              </span>
              <input
                autoFocus
                type="search"
                value={consumeSearch}
                onChange={(event) => {
                  setConsumeSearch(event.target.value);
                  setConsumeItemId("");
                  setConsumeError("");
                }}
                placeholder="Type item name or code"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </label>

            {!selectedConsumeItem && (
              <div className="mb-4 max-h-52 overflow-y-auto rounded-lg border border-slate-200">
                {consumeSuggestions.length > 0 ? (
                  consumeSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setConsumeItemId(item.id);
                        setConsumeSearch(item.name);
                        setConsumeQuantity("");
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-emerald-50"
                    >
                      <span>
                        <span className="block text-sm font-semibold">
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.code ? `${item.code} · ` : ""}
                          {displayTeam(item.team)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-emerald-800">
                        {getAvailableQuantity(item)}{" "}
                        {item.stockUnit ?? item.uom}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-slate-500">
                    No matching items have stock available.
                  </p>
                )}
              </div>
            )}

            {selectedConsumeItem && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {selectedConsumeItem.name}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800">
                      Currently available:{" "}
                      <strong>
                        {getAvailableQuantity(selectedConsumeItem)}{" "}
                        {selectedConsumeItem.stockUnit ??
                          selectedConsumeItem.uom}
                      </strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConsumeItemId("");
                      setConsumeSearch("");
                      setConsumeQuantity("");
                    }}
                    className="text-xs font-semibold text-emerald-800 underline"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Quantity used
              </span>
              <input
                required
                type="number"
                min="0.01"
                step="any"
                max={
                  selectedConsumeItem
                    ? getAvailableQuantity(selectedConsumeItem)
                    : undefined
                }
                value={consumeQuantity}
                onChange={(event) => setConsumeQuantity(event.target.value)}
                disabled={!selectedConsumeItem || consuming}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Note (optional)
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={consumeNote}
                onChange={(event) => setConsumeNote(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            {consumeError && <ErrorMessage>{consumeError}</ErrorMessage>}

            <ModalActions
              onCancel={() => setConsumeOpen(false)}
              busy={consuming}
              submitText={consuming ? "Recording…" : "Confirm consumption"}
              submitDisabled={!selectedConsumeItem || !consumeQuantity}
            />
          </form>
        </Modal>
      )}

      {categoryItem && (
        <Modal
          title="Set item category"
          subtitle={categoryItem.name}
          onClose={() => !savingCategory && setCategoryItem(null)}
        >
          <form onSubmit={handleCategorySave}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Existing category
              </span>
              <select
                autoFocus
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Unassigned</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Categories are shared by this item across the country catalog.
            </p>

            {categoryError && <ErrorMessage>{categoryError}</ErrorMessage>}

            <ModalActions
              onCancel={() => setCategoryItem(null)}
              busy={savingCategory}
              submitText={savingCategory ? "Saving…" : "Save category"}
            />
          </form>
        </Modal>
      )}

      {addItemOpen && (
        <Modal
          title="Add item and opening quantity"
          subtitle={`${assignedLocation?.code ?? "Assigned nest"} · Country catalog`}
          onClose={() => !savingItem && setAddItemOpen(false)}
        >
          <form onSubmit={handleAddItem} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Item name or code
              </span>
              <input
                required
                autoComplete="off"
                maxLength={200}
                value={newItem.name}
                onChange={(event) => {
                  setExistingItemId("");
                  setNewItem({ ...newItem, name: event.target.value });
                }}
                placeholder="Type to search existing items, or enter a new item"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </label>

            {!existingItemId && addItemSuggestions.length > 0 && (
              <div className="-mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                {addItemSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseExistingItem(item)}
                    className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-emerald-50"
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.code || "No code"} · {displayTeam(item.team)} ·{" "}
                        {item.category || "Unassigned"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {item.stockQuantity === null
                        ? "No balance"
                        : `${item.stockQuantity} ${item.stockUnit ?? item.uom}`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {existingItemId ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="font-semibold">{newItem.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {newItem.code || "No item code"} ·{" "}
                  {displayTeam(newItem.team)} · {newItem.unit}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExistingItemId("");
                    setNewItem({
                      name: "",
                      code: "",
                      team: "facilities",
                      category: "",
                      unit: "",
                      quantity: newItem.quantity,
                    });
                  }}
                  className="mt-2 text-xs font-semibold text-emerald-800 underline"
                >
                  Clear selection and enter a new item
                </button>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Item code (optional)
                  </span>
                  <input
                    maxLength={80}
                    value={newItem.code}
                    onChange={(event) =>
                      setNewItem({ ...newItem, code: event.target.value })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Team
                    </span>
                    <select
                      required
                      value={newItem.team}
                      onChange={(event) =>
                        setNewItem({
                          ...newItem,
                          team: event.target.value as Team,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    >
                      {teams.map((team) => (
                        <option key={team} value={team}>
                          {displayTeam(team)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Unit of measure
                    </span>
                    <input
                      required
                      maxLength={40}
                      value={newItem.unit}
                      onChange={(event) =>
                        setNewItem({ ...newItem, unit: event.target.value })
                      }
                      placeholder="Pieces, Pack, Bottle…"
                      className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400"
                    />
                  </label>
                </div>
              </>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Existing category (optional)
              </span>
              <select
                value={newItem.category}
                onChange={(event) =>
                  setNewItem({ ...newItem, category: event.target.value })
                }
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Unassigned</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Quantity to add at this nest
              </span>
              <input
                required
                type="number"
                min="0.01"
                step="any"
                value={newItem.quantity}
                onChange={(event) =>
                  setNewItem({ ...newItem, quantity: event.target.value })
                }
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              />
            </label>

            <p className="text-xs text-slate-500">
              Selecting an existing item adds stock to it at this nest. A new
              item is added to the country catalog.
            </p>

            {addItemError && <ErrorMessage>{addItemError}</ErrorMessage>}

            <ModalActions
              onCancel={() => setAddItemOpen(false)}
              busy={savingItem}
              submitText={savingItem ? "Adding…" : "Add item and stock"}
            />
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              {subtitle}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ModalActions({
  onCancel,
  busy,
  submitText,
  submitDisabled = false,
}: {
  onCancel: () => void;
  busy: boolean;
  submitText: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy || submitDisabled}
        className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitText}
      </button>
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
    >
      {children}
    </div>
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