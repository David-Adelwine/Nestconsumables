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

type PurchaseRequestRow = {
  request_id: string;
  reference: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type PurchaseLineRow = {
  line_id: string;
  request_id: string;
  item_id: string;
  requested_quantity: number | string;
  ordered_quantity: number | string;
  received_quantity: number | string;
  unit: string;
  unit_cost_snapshot: number | string;
};

type ItemRow = {
  item_id: string;
  item_code: string | null;
  product_name: string;
  team: string;
};

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

function formatTeam(team: string | null | undefined): string {
  const value = (team ?? "").trim().toLowerCase();

  if (value === "flight") return "Flight";
  if (value === "fulfilment") return "Fulfilment";
  if (value === "facilities") return "Facilities";

  return "Facilities";
}

function normalizeStatus(status: string | null | undefined): string {
  const value = (status ?? "").trim().toLowerCase();

  const supportedStatuses = new Set([
    "requested",
    "ordered",
    "partially_received",
    "received",
    "cancelled",
  ]);

  return supportedStatuses.has(value) ? value : "requested";
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

  // Country access includes every production nest in each assigned country.
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

export async function GET(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in with an active application account." },
        { status: 401 },
      );
    }

    if (!hasRole(user, "finance") && !hasRole(user, "it_admin")) {
      return NextResponse.json(
        { error: "You do not have Finance dashboard access." },
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

    const searchParams = new URL(request.url).searchParams;
    const requestedNestId = searchParams.get("nestId");

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
        {
          error: `No currency mapping is configured for country "${nest.country ?? "unknown"}".`,
        },
        { status: 400 },
      );
    }

    const { data: requestRows, error: requestError } = await supabase
      .from("app_purchase_requests")
      .select("request_id, reference, status, created_at, updated_at")
      .eq("nest_id", nest.nest_id)
      .order("created_at", { ascending: false });

    if (requestError) {
      throw new Error(requestError.message);
    }

    const requests = (requestRows ?? []) as PurchaseRequestRow[];
    const requestIds = requests.map((item) => item.request_id);

    let purchaseLines: PurchaseLineRow[] = [];

    if (requestIds.length > 0) {
      const { data, error } = await supabase
        .from("app_purchase_request_lines")
        .select(
          [
            "line_id",
            "request_id",
            "item_id",
            "requested_quantity",
            "ordered_quantity",
            "received_quantity",
            "unit",
            "unit_cost_snapshot",
          ].join(", "),
        )
        .in("request_id", requestIds);

      if (error) {
        throw new Error(error.message);
      }

      purchaseLines = (data ?? []) as unknown as PurchaseLineRow[];
    }

    const itemIds = [
      ...new Set(purchaseLines.map((line) => line.item_id).filter(Boolean)),
    ];

    let itemRows: ItemRow[] = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("app_items")
        .select("item_id, item_code, product_name, team")
        .in("item_id", itemIds);

      if (error) {
        throw new Error(error.message);
      }

      itemRows = (data ?? []) as unknown as ItemRow[];
    }

    const requestById = new Map(
      requests.map((purchaseRequest) => [
        purchaseRequest.request_id,
        purchaseRequest,
      ]),
    );

    const itemById = new Map(
      itemRows.map((item) => [item.item_id, item]),
    );

    const lines = purchaseLines.map((line) => {
      const purchaseRequest = requestById.get(line.request_id);
      const item = itemById.get(line.item_id);

      return {
        id: line.line_id,
        requestId: line.request_id,
        reference: purchaseRequest?.reference ?? "—",
        status: normalizeStatus(purchaseRequest?.status),
        createdAt: purchaseRequest?.created_at ?? null,
        updatedAt: purchaseRequest?.updated_at ?? null,
        itemCode: item?.item_code ?? "",
        itemName: item?.product_name ?? "Unknown item",
        team: formatTeam(item?.team),
        requestedQuantity: toNumber(line.requested_quantity),
        orderedQuantity: toNumber(line.ordered_quantity),
        receivedQuantity: toNumber(line.received_quantity),
        unit: line.unit,
        unitCost: toNumber(line.unit_cost_snapshot),
      };
    });

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
          currencyCode,
        },
        lines,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Finance dashboard GET failed:", error);

    return NextResponse.json(
      { error: "Unable to load Finance dashboard data." },
      { status: 500 },
    );
  }
}