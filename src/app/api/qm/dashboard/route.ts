import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";

type AppUser = NonNullable<Awaited<ReturnType<typeof getUserContext>>>;
type Team = "flight" | "fulfilment" | "facilities";

type NestRow = {
  nest_id: number;
  nest_key: string | null;
  nest_name: string;
  country: string | null;
};

type ItemRow = {
  item_id: string;
  item_code: string | null;
  product_name: string;
  team: string;
  subcategory: string | null;
  unit: string;
  is_active?: boolean;
};

const allTeams: Team[] = ["flight", "fulfilment", "facilities"];

function normalizeTeam(value: unknown): Team | null {
  const team = String(value ?? "").trim().toLowerCase();
  return allTeams.includes(team as Team) ? (team as Team) : null;
}

function formatNestCode(nestKey: string | null, nestId: number) {
  const match = nestKey?.trim().match(/^([a-z]+)[-_\s]?(\d+)$/i);

  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nestId}`;
}

function currencyForCountry(country: string | null) {
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

function addNestRows(
  found: Map<number, NestRow>,
  data: unknown,
  error: { message: string } | null,
) {
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as NestRow[]) {
    found.set(Number(row.nest_id), {
      ...row,
      nest_id: Number(row.nest_id),
    });
  }
}

async function getAccessibleNests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
) {
  const found = new Map<number, NestRow>();

  const productionNests = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  if (hasRole(user, "it_admin")) {
    const { data, error } = await productionNests();
    addNestRows(found, data, error);
  } else {
    const nestIds = [
      ...new Set(
        user.nestAccess
          .map((access) => Number(access.nestId))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];

    if (nestIds.length > 0) {
      const { data, error } = await productionNests().in("nest_id", nestIds);
      addNestRows(found, data, error);
    }
  }

  return [...found.values()].sort((a, b) =>
    a.nest_name.localeCompare(b.nest_name),
  );
}

async function getNestForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
  nestId: string,
) {
  const nests = await getAccessibleNests(supabase, user);
  const nest = nests.find((row) => String(row.nest_id) === nestId);

  if (!nest) return null;

  if (
    !hasRole(user, "it_admin") &&
    !user.nestAccess.some((access) => access.nestId === nestId)
  ) {
    return null;
  }

  return { nest, nests };
}

async function loadItemForCountry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  country: string,
  itemId: string,
) {
  const { data, error } = await supabase
    .from("app_items")
    .select("item_id, item_code, product_name, team, subcategory, unit")
    .eq("item_id", itemId)
    .eq("country", country)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as ItemRow | null;
}

async function getExistingCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  country: string,
) {
  const { data, error } = await supabase
    .from("app_items")
    .select("subcategory")
    .eq("country", country)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.subcategory ?? "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in to view this dashboard." },
        { status: 401 },
      );
    }

    if (!hasRole(user, "quartermaster") && !hasRole(user, "it_admin")) {
      return NextResponse.json(
        { error: "You do not have Quartermaster access." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);

    if (nests.length === 0) {
      return NextResponse.json(
        { error: "No assigned production nest was found." },
        { status: 404 },
      );
    }

    const requestedNestId = new URL(request.url).searchParams.get("nestId");

    if (requestedNestId && !/^\d+$/.test(requestedNestId)) {
      return NextResponse.json(
        { error: "The selected nest ID is invalid." },
        { status: 400 },
      );
    }

    const selectedNestId = requestedNestId ?? String(nests[0].nest_id);
    const scope = await getNestForUser(supabase, user, selectedNestId);

    if (!scope) {
      return NextResponse.json(
        { error: "You do not have access to the selected nest." },
        { status: 403 },
      );
    }

    const { nest } = scope;

    if (!nest.country) {
      return NextResponse.json(
        { error: "The selected nest has no country assigned." },
        { status: 400 },
      );
    }

    const { data: itemData, error: itemError } = await supabase
      .from("app_items")
      .select("item_id, item_code, product_name, team, subcategory, unit")
      .eq("country", nest.country)
      .eq("is_active", true)
      .order("product_name", { ascending: true });

    if (itemError) throw new Error(itemError.message);

    const catalog = (itemData ?? []) as ItemRow[];
    const itemIds = catalog.map((item) => item.item_id);

    let stockRows: Array<{
      item_id: string;
      quantity: number | string;
      unit: string | null;
      updated_at: string | null;
    }> = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("app_stock_balances")
        .select("item_id, quantity, unit, updated_at")
        .eq("nest_id", nest.nest_id)
        .in("item_id", itemIds);

      if (error) throw new Error(error.message);
      stockRows = (data ?? []) as typeof stockRows;
    }

    const stockByItemId = new Map(
      stockRows.map((stock) => [
        stock.item_id,
        {
          quantity: Number(stock.quantity),
          unit: stock.unit,
          updatedAt: stock.updated_at,
        },
      ]),
    );

    const categories = await getExistingCategories(supabase, nest.country);

    const { data: requestData, error: requestError } = await supabase
      .from("app_purchase_requests")
      .select("request_id, reference, status, created_at")
      .eq("nest_id", nest.nest_id)
      .in("status", ["ordered", "partially_received"])
      .order("created_at", { ascending: true });

    if (requestError) throw new Error(requestError.message);

    const purchaseRequests = requestData ?? [];
    const requestIds = purchaseRequests.map((row) => row.request_id);
    const requestById = new Map(
      purchaseRequests.map((row) => [row.request_id, row]),
    );

    let pendingReceipts: Array<{
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
    }> = [];

    if (requestIds.length > 0) {
      const { data: lineData, error: lineError } = await supabase
        .from("app_purchase_request_lines")
        .select(
          "line_id, request_id, item_id, ordered_quantity, received_quantity, unit",
        )
        .in("request_id", requestIds);

      if (lineError) throw new Error(lineError.message);

      const lines = lineData ?? [];
      const receiptItemIds = [...new Set(lines.map((line) => line.item_id))];

      let receiptItems: Array<{
        item_id: string;
        product_name: string;
        item_code: string | null;
        team: string;
      }> = [];

      if (receiptItemIds.length > 0) {
        const { data, error } = await supabase
          .from("app_items")
          .select("item_id, product_name, item_code, team")
          .in("item_id", receiptItemIds);

        if (error) throw new Error(error.message);
        receiptItems = data ?? [];
      }

      const receiptItemById = new Map(
        receiptItems.map((item) => [item.item_id, item]),
      );

      pendingReceipts = lines.flatMap((line) => {
        const purchaseRequest = requestById.get(line.request_id);
        const item = receiptItemById.get(line.item_id);

        if (!purchaseRequest || !item) return [];

        const orderedQuantity = Number(line.ordered_quantity);
        const receivedQuantity = Number(line.received_quantity);

        return [
          {
            lineId: line.line_id,
            requestId: line.request_id,
            reference: purchaseRequest.reference,
            status: purchaseRequest.status,
            createdAt: purchaseRequest.created_at,
            itemId: line.item_id,
            itemName: item.product_name,
            itemCode: item.item_code,
            team: item.team,
            unit: line.unit,
            orderedQuantity,
            receivedQuantity,
            pendingQuantity: orderedQuantity - receivedQuantity,
          },
        ];
      });
    }

    return NextResponse.json(
      {
        assignedNest: {
          nestId: String(nest.nest_id),
          code: formatNestCode(nest.nest_key, nest.nest_id),
          name: nest.nest_name,
          country: nest.country,
        },
        availableNests: nests.map((row) => ({
          nestId: String(row.nest_id),
          code: formatNestCode(row.nest_key, row.nest_id),
          name: row.nest_name,
          country: row.country,
        })),
        allowedTeams: allTeams,
        categories,
        pendingReceipts,
        items: catalog.flatMap((item) => {
          const team = normalizeTeam(item.team);
          if (!team) return [];

          const stock = stockByItemId.get(item.item_id);

          return [
            {
              id: item.item_id,
              code: item.item_code,
              name: item.product_name,
              team,
              category: item.subcategory,
              uom: stock?.unit ?? item.unit,
              stockQuantity: stock?.quantity ?? null,
              stockUnit: stock?.unit ?? null,
              stockUpdatedAt: stock?.updatedAt ?? null,
            },
          ];
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Quartermaster dashboard GET failed:", error);

    return NextResponse.json(
      { error: "Unable to load the Quartermaster dashboard." },
      { status: 500 },
    );
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

    if (!hasRole(user, "quartermaster") && !hasRole(user, "it_admin")) {
      return NextResponse.json(
        { error: "You do not have Quartermaster access." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const nestId = String(body.nestId ?? "");

    if (!/^\d+$/.test(nestId)) {
      return NextResponse.json(
        { error: "Select a valid nest." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const scope = await getNestForUser(supabase, user, nestId);

    if (!scope) {
      return NextResponse.json(
        { error: "You do not have access to this nest." },
        { status: 403 },
      );
    }

    const { nest } = scope;

    if (!nest.country) {
      return NextResponse.json(
        { error: "The selected nest has no country assigned." },
        { status: 400 },
      );
    }

    if (action === "acknowledge_request_receipt") {
      const requestId = String(body.requestId ?? "").trim();
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const nestCode = formatNestCode(nest.nest_key, nest.nest_id);

      if (!uuidPattern.test(requestId) || !Array.isArray(body.lines)) {
        return NextResponse.json(
          {
            error:
              "Select a valid purchase and include its received quantities.",
          },
          { status: 400 },
        );
      }

      const { data: purchase, error: purchaseError } = await supabase
        .from("app_purchase_requests")
        .select("request_id, status")
        .eq("request_id", requestId)
        .eq("nest_id", nest.nest_id)
        .maybeSingle();

      if (purchaseError) throw new Error(purchaseError.message);

      if (!purchase) {
        return NextResponse.json(
          { error: "Purchase request not found at this nest." },
          { status: 404 },
        );
      }

      if (!["ordered", "partially_received"].includes(purchase.status)) {
        return NextResponse.json(
          { error: "This purchase is not waiting for receipt." },
          { status: 409 },
        );
      }

      const { data: requestLines, error: requestLinesError } = await supabase
        .from("app_purchase_request_lines")
        .select(
          "line_id, item_id, ordered_quantity, received_quantity, unit",
        )
        .eq("request_id", requestId);

      if (requestLinesError) throw new Error(requestLinesError.message);

      const pendingLines = (requestLines ?? []).filter(
        (line) =>
          Number(line.ordered_quantity) > Number(line.received_quantity),
      );

      const submittedLines = body.lines as Array<Record<string, unknown>>;
      const submittedIds = submittedLines.map((line) =>
        String(line?.lineId ?? "").trim(),
      );

      if (
        pendingLines.length === 0 ||
        submittedIds.some((id) => !uuidPattern.test(id)) ||
        new Set(submittedIds).size !== submittedIds.length ||
        submittedIds.length !== pendingLines.length
      ) {
        return NextResponse.json(
          {
            error:
              "The receipt manifest changed. Reload it and review the current quantities.",
          },
          { status: 409 },
        );
      }

      const itemIds = [...new Set(pendingLines.map((line) => line.item_id))];
      const { data: itemData, error: itemError } = await supabase
        .from("app_items")
        .select("item_id, product_name")
        .in("item_id", itemIds);

      if (itemError) throw new Error(itemError.message);

      const itemNameById = new Map(
        (itemData ?? []).map((item) => [item.item_id, item.product_name]),
      );

      const submittedById = new Map(
        submittedLines.map((line) => [
          String(line.lineId).trim(),
          Number(line.quantity),
        ]),
      );

      const receipts: Array<{ lineId: string; quantity: number }> = [];

      for (const line of pendingLines) {
        const orderedQuantity = Number(line.ordered_quantity);
        const receivedQuantity = Number(line.received_quantity);
        const pendingQuantity = orderedQuantity - receivedQuantity;
        const quantity = submittedById.get(line.line_id);
        const itemName = itemNameById.get(line.item_id) ?? "this item";
        const unit = String(line.unit ?? "unit");

        if (
          !Number.isSafeInteger(orderedQuantity) ||
          !Number.isSafeInteger(receivedQuantity) ||
          !Number.isSafeInteger(pendingQuantity)
        ) {
          return NextResponse.json(
            {
              error:
                "This purchase has a fractional remaining balance from an earlier entry. Ask an administrator to correct it before acknowledging receipt.",
            },
            { status: 409 },
          );
        }

        if (quantity === undefined || !Number.isSafeInteger(quantity)) {
          return NextResponse.json(
            {
              error:
                "Enter a whole-number quantity. Fractional receipts are not allowed.",
            },
            { status: 400 },
          );
        }

        if (quantity <= 0) {
          return NextResponse.json(
            {
              error: `Enter at least 1 ${unit} for ${itemName}.`,
            },
            { status: 400 },
          );
        }

        if (quantity > pendingQuantity) {
          const excess = quantity - pendingQuantity;

          return NextResponse.json(
            {
              error: `You're receiving ${excess} ${unit} more than the ${pendingQuantity} ${unit} still expected for ${itemName} at ${nestCode}. You can receive up to ${pendingQuantity} ${unit}.`,
            },
            { status: 400 },
          );
        }

        receipts.push({ lineId: line.line_id, quantity });
      }

      let acknowledgedCount = 0;

      for (const receipt of receipts) {
        const { error } = await supabase.rpc("qm_receive_purchase_line", {
          p_line_id: receipt.lineId,
          p_nest_id: nest.nest_id,
          p_quantity: receipt.quantity,
        });

        if (error) {
          const conflict = /pending|exceeds|waiting for receipt/i.test(
            error.message,
          );

          return NextResponse.json(
            {
              error: `${acknowledgedCount} of ${receipts.length} item line(s) were acknowledged before an error: ${error.message}. Reload the manifest and review the remaining quantities.`,
              acknowledgedCount,
            },
            { status: conflict ? 409 : 400 },
          );
        }

        acknowledgedCount += 1;
      }

      return NextResponse.json({
        success: true,
        acknowledgedCount,
      });
    }

    if (action === "update_category") {
      const itemId = String(body.itemId ?? "");
      const category = String(body.category ?? "").trim();

      if (!itemId) {
        return NextResponse.json(
          { error: "Select an item." },
          { status: 400 },
        );
      }

      const categories = await getExistingCategories(supabase, nest.country);

      if (category && !categories.includes(category)) {
        return NextResponse.json(
          { error: "Choose a category that already exists in this country." },
          { status: 400 },
        );
      }

      const item = await loadItemForCountry(
        supabase,
        nest.country,
        itemId,
      );

      if (!item) {
        return NextResponse.json(
          { error: "Item not found in this country's catalog." },
          { status: 404 },
        );
      }

      const { error } = await supabase
        .from("app_items")
        .update({
          subcategory: category || null,
          updated_at: new Date().toISOString(),
        })
        .eq("item_id", itemId)
        .eq("country", nest.country);

      if (error) throw new Error(error.message);

      return NextResponse.json({ success: true });
    }

    if (action !== "add_item") {
      return NextResponse.json(
        { error: "Unknown Quartermaster action." },
        { status: 400 },
      );
    }

    const existingItemId = String(body.existingItemId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const requestedCode = String(body.code ?? "").trim();
    const team = normalizeTeam(body.team);
    const unit = String(body.unit ?? "").trim();
    const category = String(body.category ?? "").trim();
    const quantity = Number(body.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Opening quantity must be greater than zero." },
        { status: 400 },
      );
    }

    const categories = await getExistingCategories(supabase, nest.country);

    if (category && !categories.includes(category)) {
      return NextResponse.json(
        { error: "Choose a category that already exists in this country." },
        { status: 400 },
      );
    }

    let item: ItemRow | null = null;
    let createdNewItem = false;

    if (existingItemId) {
      item = await loadItemForCountry(
        supabase,
        nest.country,
        existingItemId,
      );

      if (!item) {
        return NextResponse.json(
          { error: "The selected item is not in this country's catalog." },
          { status: 404 },
        );
      }

      if ((item.subcategory ?? "") !== category) {
        const { error } = await supabase
          .from("app_items")
          .update({
            subcategory: category || null,
            updated_at: new Date().toISOString(),
          })
          .eq("item_id", item.item_id)
          .eq("country", nest.country);

        if (error) throw new Error(error.message);
      }
    } else {
      if (!name || name.length > 200 || !team || !unit || unit.length > 40) {
        return NextResponse.json(
          { error: "For a new item, enter its name, team, and unit." },
          { status: 400 },
        );
      }

      const currencyCode = currencyForCountry(nest.country);

      if (!currencyCode) {
        return NextResponse.json(
          { error: "No currency mapping is configured for this country." },
          { status: 400 },
        );
      }

      const itemCode =
        requestedCode ||
        `CUS-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

      const { data, error } = await supabase
        .from("app_items")
        .insert({
          country: nest.country,
          item_code: itemCode,
          product_name: name,
          team,
          subcategory: category || null,
          unit,
          default_minimum: 0,
          unit_cost: null,
          currency_code: currencyCode,
          is_custom: true,
          is_active: true,
          created_by: user.userId,
        })
        .select("item_id, item_code, product_name, team, subcategory, unit")
        .single();

      if (error) throw new Error(error.message);

      item = data as ItemRow;
      createdNewItem = true;
    }

    const itemId = item.item_id;
    const stockUnit = item.unit || unit || "unit";
    const movementType = createdNewItem ? "opening" : "receipt";

    const { data: newQuantity, error: stockError } = await supabase.rpc(
      "qm_add_stock_quantity",
      {
        p_nest_id: nest.nest_id,
        p_item_id: itemId,
        p_quantity: quantity,
        p_unit: stockUnit,
        p_movement_type: movementType,
        p_reference: `QM-ADD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        p_note: createdNewItem
          ? "Opening quantity added by Quartermaster"
          : "Additional quantity added by Quartermaster",
      },
    );

    if (stockError) {
      if (createdNewItem) {
        await supabase.from("app_items").delete().eq("item_id", itemId);
      }
      throw new Error(stockError.message);
    }

    return NextResponse.json({
      success: true,
      itemId,
      quantity: Number(newQuantity),
      createdNewItem,
    });
  } catch (error) {
    console.error("Quartermaster dashboard POST failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save the Quartermaster update.",
      },
      { status: 500 },
    );
  }
}