import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";

type AppUser = NonNullable<Awaited<ReturnType<typeof getUserContext>>>;

type NestRow = {
  nest_id: number;
  nest_key: string | null;
  nest_name: string;
  country: string | null;
};

type OrderInputLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
};

type PurchaseItemRow = {
  item_id: string;
  unit: string;
  unit_cost: number | string | null;
  currency_code: string | null;
  is_active: boolean;
};

type StockRow = {
  item_id: string;
  quantity: number | string;
  unit: string | null;
  updated_at: string | null;
};

type CatalogItemRow = {
  item_id: string;
  item_code: string | null;
  product_name: string;
  team: string;
  subcategory: string | null;
  unit: string;
  unit_cost: number | string | null;
  currency_code: string | null;
};

function canManageProcurement(user: AppUser): boolean {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "business_ops_manager") ||
    hasRole(user, "procurement")
  );
}

function getCurrency(country: string | null): string | null {
  const value = (country ?? "").trim().toUpperCase();

  if (value === "GH" || value.includes("GHANA")) return "GHS";
  if (value === "RW" || value.includes("RWANDA")) return "RWF";
  if (value === "NG" || value.includes("NIGERIA")) return "NGN";

  if (
    value === "CI" ||
    value.includes("COTE") ||
    value.includes("CÔTE") ||
    value.includes("IVORY")
  ) {
    return "XOF";
  }

  if (value === "KE" || value.includes("KENYA")) return "KES";

  return null;
}

function formatNestCode(nestKey: string | null, nestId: number): string {
  const match = nestKey?.trim().match(/^([a-z]+)[-_\s]?(\d+)$/i);

  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nestId}`;
}

function addNestRows(
  found: Map<number, NestRow>,
  data: unknown,
  error: { message: string } | null,
): void {
  if (error) {
    throw new Error(error.message);
  }

  for (const nest of (data ?? []) as NestRow[]) {
    found.set(Number(nest.nest_id), {
      ...nest,
      nest_id: Number(nest.nest_id),
    });
  }
}

async function getAccessibleNests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
): Promise<NestRow[]> {
  const found = new Map<number, NestRow>();

  const productionNests = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  if (hasRole(user, "it_admin")) {
    const { data, error } = await productionNests();
    addNestRows(found, data, error);

    return [...found.values()].sort((a, b) =>
      a.nest_name.localeCompare(b.nest_name),
    );
  }

  // Country access includes all production nests in each assigned country.
  const countryCodes = [
    ...new Set(
      user.countryAccess
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (countryCodes.length > 0) {
    const { data, error } = await productionNests().in(
      "country",
      countryCodes,
    );

    addNestRows(found, data, error);
  }

  // Include directly assigned nests.
  const directNestIds = [
    ...new Set(
      user.nestAccess
        .map((access) => Number(access.nestId))
        .filter((nestId) => Number.isSafeInteger(nestId) && nestId > 0),
    ),
  ];

  if (directNestIds.length > 0) {
    const { data, error } = await productionNests().in(
      "nest_id",
      directNestIds,
    );

    addNestRows(found, data, error);
  }

  // Include nests assigned through the user's regions.
  const regionIds = [...new Set(user.regionAccess.filter(Boolean))];

  if (regionIds.length > 0) {
    const { data, error } = await supabase
      .from("app_nest_regions")
      .select("nest_id")
      .in("region_id", regionIds);

    if (error) {
      throw new Error(error.message);
    }

    const regionNestIds = [
      ...new Set(
        (data ?? [])
          .map((row) => Number(row.nest_id))
          .filter((nestId) => Number.isSafeInteger(nestId) && nestId > 0),
      ),
    ];

    if (regionNestIds.length > 0) {
      const { data: regionNests, error: regionNestError } =
        await productionNests().in("nest_id", regionNestIds);

      addNestRows(found, regionNests, regionNestError);
    }
  }

  return [...found.values()].sort((a, b) =>
    a.nest_name.localeCompare(b.nest_name),
  );
}

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error);

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in with an active application account." },
        { status: 401 },
      );
    }

    if (!canManageProcurement(user)) {
      return NextResponse.json(
        { error: "You do not have procurement access." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);

    if (nests.length === 0) {
      return NextResponse.json(
        { error: "No accessible production nests were found." },
        { status: 404 },
      );
    }

    const requestedNestId = new URL(request.url).searchParams.get("nestId");
    const nest = requestedNestId
      ? nests.find((item) => String(item.nest_id) === requestedNestId)
      : nests[0];

    if (!nest) {
      return NextResponse.json(
        { error: "You do not have access to the selected nest." },
        { status: 403 },
      );
    }

    const currencyCode = getCurrency(nest.country);

    if (!currencyCode) {
      return NextResponse.json(
        { error: `No currency mapping is configured for ${nest.country}.` },
        { status: 400 },
      );
    }

    const { data: itemData, error: itemError } = await supabase
      .from("app_items")
      .select(
        "item_id, item_code, product_name, team, subcategory, unit, unit_cost, currency_code",
      )
      .eq("country", nest.country)
      .eq("is_active", true)
      .order("product_name", { ascending: true });

    if (itemError) {
      throw new Error(itemError.message);
    }

    const items = (itemData ?? []) as unknown as CatalogItemRow[];
    const itemIds = items.map((item) => item.item_id);

    let stockRows: StockRow[] = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("app_stock_balances")
        .select("item_id, quantity, unit, updated_at")
        .eq("nest_id", nest.nest_id)
        .in("item_id", itemIds);

      if (error) {
        throw new Error(error.message);
      }

      stockRows = (data ?? []) as unknown as StockRow[];
    }

    const stockByItem = new Map(
      stockRows.map((row) => [row.item_id, row]),
    );

    const { data: recentRequests, error: requestsError } = await supabase
      .from("app_purchase_requests")
      .select("request_id, reference, status, created_at")
      .eq("nest_id", nest.nest_id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (requestsError) {
      throw new Error(requestsError.message);
    }

    return NextResponse.json(
      {
        nests: nests.map((item) => ({
          id: String(item.nest_id),
          code: formatNestCode(item.nest_key, item.nest_id),
          name: item.nest_name,
          country: item.country,
        })),
        selectedNest: {
          id: String(nest.nest_id),
          code: formatNestCode(nest.nest_key, nest.nest_id),
          name: nest.nest_name,
          country: nest.country,
        },
        currencyCode,
        items: items.map((item) => {
          const stock = stockByItem.get(item.item_id);

          return {
            id: item.item_id,
            code: item.item_code ?? "",
            name: item.product_name,
            team: item.team,
            category: item.subcategory,
            uom: stock?.unit ?? item.unit,
            unitCost:
              item.unit_cost === null ? null : Number(item.unit_cost),
            currencyCode: item.currency_code ?? currencyCode,
            quantity: stock ? Number(stock.quantity) : null,
            updatedAt: stock?.updated_at ?? null,
          };
        }),
        recentRequests: recentRequests ?? [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return errorResponse(error, "Unable to load procurement data.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in with an active application account." },
        { status: 401 },
      );
    }

    if (!canManageProcurement(user)) {
      return NextResponse.json(
        { error: "You do not have procurement access." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const body = (await request.json()) as Record<string, unknown>;
    const nests = await getAccessibleNests(supabase, user);

    if (body.action === "add_item") {
      const nest = nests.find(
        (item) => String(item.nest_id) === String(body.nestId ?? ""),
      );

      if (!nest) {
        return NextResponse.json(
          { error: "You do not have access to this nest." },
          { status: 403 },
        );
      }

      const name = String(body.name ?? "").trim();
      const unit = String(body.unit ?? "").trim();
      const team = String(body.team ?? "").trim().toLowerCase();
      const currencyCode = getCurrency(nest.country);
      const quantity = Number(body.quantity);

      if (
        !name ||
        name.length > 200 ||
        !unit ||
        unit.length > 40 ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        !["flight", "fulfilment", "facilities"].includes(team)
      ) {
        return NextResponse.json(
          { error: "Enter an item name, unit, and valid team." },
          { status: 400 },
        );
      }

      if (!currencyCode) {
        return NextResponse.json(
          { error: "The nest country has no currency mapping." },
          { status: 400 },
        );
      }

      const itemCode =
        String(body.code ?? "").trim() ||
        `CUS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const rawCost =
        body.unitCost === "" || body.unitCost == null
          ? null
          : Number(body.unitCost);

      if (
        rawCost === null ||
        !Number.isFinite(rawCost) ||
        rawCost < 0
      ) {
        return NextResponse.json(
          { error: "Unit price must be zero or greater." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_items")
        .insert({
          country: nest.country,
          item_code: itemCode,
          product_name: name,
          team,
          subcategory: String(body.category ?? "").trim() || "Unassigned",
          unit,
          unit_cost: rawCost,
          currency_code: currencyCode,
          is_custom: true,
          is_active: true,
          created_by: user.userId,
        })
        .select("item_id, item_code")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ itemId: data.item_id, itemCode: data.item_code });
    }

    if (body.action === "update_price") {
      const nest = nests.find(
        (item) => String(item.nest_id) === String(body.nestId ?? ""),
      );
      const itemId = String(body.itemId ?? "");
      const unitCost = Number(body.unitCost);

      if (
        !nest ||
        !itemId ||
        !Number.isFinite(unitCost) ||
        unitCost < 0
      ) {
        return NextResponse.json(
          { error: "The price update is invalid." },
          { status: 400 },
        );
      }

      const currencyCode = getCurrency(nest.country);

      if (!currencyCode) {
        return NextResponse.json(
          { error: "The nest country has no currency mapping." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_items")
        .update({
          unit_cost: unitCost,
          currency_code: currencyCode,
          updated_at: new Date().toISOString(),
        })
        .eq("item_id", itemId)
        .eq("country", nest.country)
        .select("item_id")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return NextResponse.json(
          { error: "The item was not found in this nest's country." },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true });
    }

    if (body.action === "submit_order") {
      const nest = nests.find(
        (item) => String(item.nest_id) === String(body.nestId ?? ""),
      );

      if (!nest || !Array.isArray(body.lines) || body.lines.length === 0) {
        return NextResponse.json(
          { error: "Choose a nest and add at least one item." },
          { status: 400 },
        );
      }

      const currencyCode = getCurrency(nest.country);

      if (!currencyCode) {
        return NextResponse.json(
          { error: "The nest country has no currency mapping." },
          { status: 400 },
        );
      }

      const requestLines = body.lines as OrderInputLine[];
      const itemIds = requestLines.map((line) => String(line?.itemId ?? ""));

      if (
        itemIds.length === 0 ||
        itemIds.some((id) => !id) ||
        new Set(itemIds).size !== itemIds.length
      ) {
        return NextResponse.json(
          { error: "Add at least one valid item to the order." },
          { status: 400 },
        );
      }

      const { data: itemData, error: itemsError } = await supabase
        .from("app_items")
        .select("item_id, unit, unit_cost, currency_code, is_active")
        .eq("country", nest.country)
        .in("item_id", itemIds);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      const itemRows = (itemData ?? []) as unknown as PurchaseItemRow[];
      const itemMap = new Map(
        itemRows.map((item) => [item.item_id, item]),
      );

      const lineRows: Array<{
        item_id: string;
        requested_quantity: number;
        unit: string;
        unit_cost_snapshot: number;
      }> = [];

      for (const line of requestLines) {
        const item = itemMap.get(String(line.itemId));
        const quantity = Number(line.quantity);

        if (
          !item ||
          !item.is_active ||
          !Number.isInteger(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(Number(line.unitCost)) ||
          Number(line.unitCost) < 0
        ) {
          return NextResponse.json(
            {
              error:
                "Every order item must be active and have a valid purchase price and whole-number quantity.",
            },
            { status: 400 },
          );
        }

        if (item.currency_code && item.currency_code !== currencyCode) {
          return NextResponse.json(
            {
              error:
                "An item currency does not match the selected nest currency.",
            },
            { status: 400 },
          );
        }

        lineRows.push({
          item_id: item.item_id,
          requested_quantity: quantity,
          unit: item.unit,
          unit_cost_snapshot: Number(line.unitCost),
        });
      }

      const { data: purchase, error: purchaseError } = await supabase
        .from("app_purchase_requests")
        .insert({
          nest_id: nest.nest_id,
          currency_code: currencyCode,
          status: "ordered",
          created_by: user.userId,
        })
        .select("request_id, reference, status")
        .single();

      if (purchaseError) {
        throw new Error(purchaseError.message);
      }

      const { error: linesError } = await supabase
        .from("app_purchase_request_lines")
        .insert(
          lineRows.map((line) => ({
            ...line,
            request_id: purchase.request_id,
            ordered_quantity: line.requested_quantity,
            received_quantity: 0,
          })),
        );

      if (linesError) {
        await supabase
          .from("app_purchase_requests")
          .delete()
          .eq("request_id", purchase.request_id);

        throw new Error(linesError.message);
      }

      return NextResponse.json({ purchase });
    }

    return NextResponse.json(
      { error: "Unknown procurement action." },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error, "Unable to complete the procurement action.");
  }
}