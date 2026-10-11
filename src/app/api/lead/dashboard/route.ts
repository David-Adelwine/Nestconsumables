import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getUserContext,
  hasRole,
  type AppTeam,
} from "@/lib/auth/get-user-context";

type AppUser = NonNullable<Awaited<ReturnType<typeof getUserContext>>>;

type NestRow = {
  nest_id: number;
  nest_key: string | null;
  nest_name: string;
  country: string | null;
};

const allTeams: AppTeam[] = ["flight", "fulfilment", "facilities"];

function addNestRows(
  found: Map<number, NestRow>,
  data: unknown,
  error: { message: string } | null,
) {
  if (error) throw new Error(error.message);

  for (const nest of (data ?? []) as NestRow[]) {
    found.set(Number(nest.nest_id), nest);
  }
}

function formatNestCode(nestKey: string | null, nestId: number) {
  const match = nestKey?.trim().match(/^([a-z]+)[-_\s]?(\d+)$/i);

  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nestId}`;
}

function formatCountry(country: string | null) {
  const value = (country ?? "").trim().toUpperCase();

  const names: Record<string, string> = {
    GH: "Ghana",
    RW: "Rwanda",
    NG: "Nigeria",
    CI: "Côte d’Ivoire",
    KE: "Kenya",
  };

  return names[value] ?? country ?? "Unknown country";
}

async function getAccessibleNests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
) {
  const found = new Map<number, NestRow>();

  const baseQuery = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  if (hasRole(user, "it_admin")) {
    const result = await baseQuery();
    addNestRows(found, result.data, result.error);
  } else {
    if (hasRole(user, "business_ops_manager") && user.countryAccess.length > 0) {
      const result = await baseQuery().in("country", user.countryAccess);
      addNestRows(found, result.data, result.error);
    }

    const assignedNestIds = [
      ...new Set(user.nestAccess.map((access) => Number(access.nestId))),
    ];

    if (assignedNestIds.length > 0) {
      const result = await baseQuery().in("nest_id", assignedNestIds);
      addNestRows(found, result.data, result.error);
    }

    if (
      hasRole(user, "business_ops_manager") &&
      user.regionAccess.length > 0
    ) {
      const { data, error } = await supabase
        .from("app_nest_regions")
        .select("nest_id")
        .in("region_id", user.regionAccess);

      if (error) throw new Error(error.message);

      const regionNestIds = [
        ...new Set((data ?? []).map((row) => Number(row.nest_id))),
      ];

      if (regionNestIds.length > 0) {
        const result = await baseQuery().in("nest_id", regionNestIds);
        addNestRows(found, result.data, result.error);
      }
    }
  }

  return [...found.values()].sort((a, b) =>
    a.nest_name.localeCompare(b.nest_name),
  );
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();

    if (!user?.isActive) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const canViewDashboard =
      hasRole(user, "nest_lead") ||
      hasRole(user, "business_ops_manager") ||
      hasRole(user, "it_admin");

    if (!canViewDashboard) {
      return NextResponse.json(
        { error: "You do not have access to the Nest Lead dashboard." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);
    const requestedNestId = new URL(request.url).searchParams.get("nestId");

    const selectedNest = requestedNestId
      ? nests.find((nest) => String(nest.nest_id) === requestedNestId)
      : nests[0];

    if (!selectedNest) {
      return NextResponse.json(
        { error: "No accessible production nest was found." },
        { status: 404 },
      );
    }

    const assignments = user.nestAccess.filter(
      (access) => access.nestId === String(selectedNest.nest_id),
    );

    const hasBroadNestAccess =
      hasRole(user, "it_admin") ||
      hasRole(user, "business_ops_manager");

    if (!hasBroadNestAccess && assignments.length === 0) {
      return NextResponse.json(
        { error: "You do not have access to the selected nest." },
        { status: 403 },
      );
    }

    const hasAllTeamAccess =
      hasBroadNestAccess ||
      assignments.some((access) => access.team === "*");

    const allowedTeams: AppTeam[] = hasAllTeamAccess
      ? allTeams
      : [
          ...new Set(
            assignments
              .map((access) => access.team)
              .filter((team): team is AppTeam => team !== "*"),
          ),
        ];

    if (allowedTeams.length === 0) {
      return NextResponse.json(
        { error: "No team access is assigned for this nest." },
        { status: 403 },
      );
    }

    if (!selectedNest.country) {
      return NextResponse.json(
        { error: "The selected nest has no country assigned." },
        { status: 400 },
      );
    }

    const { data: itemRows, error: itemError } = await supabase
      .from("app_items")
      .select(
        "item_id, item_code, product_name, team, subcategory, unit",
      )
      .eq("country", selectedNest.country)
      .eq("is_active", true)
      .in("team", allowedTeams)
      .order("product_name", { ascending: true });

    if (itemError) throw new Error(itemError.message);

    const items = itemRows ?? [];
    const itemIds = items.map((item) => item.item_id);

    type StockRow = {
      item_id: string;
      quantity: number;
      unit: string | null;
      updated_at: string | null;
    };

    let stockRows: StockRow[] = [];

    if (itemIds.length > 0) {
      const { data, error } = await supabase
        .from("app_stock_balances")
        .select("item_id, quantity, unit, updated_at")
        .eq("nest_id", selectedNest.nest_id)
        .in("item_id", itemIds);

      if (error) throw new Error(error.message);
      stockRows = (data ?? []) as StockRow[];
    }

    const stockByItem = new Map<string, StockRow>(
      stockRows.map((row) => [row.item_id, row]),
    );

    const nestOptions = nests.filter((nest) => {
      if (hasBroadNestAccess) return true;

      return user.nestAccess.some(
        (access) => access.nestId === String(nest.nest_id),
      );
    });

    return NextResponse.json(
      {
        availableNests: nestOptions.map((nest) => ({
          id: String(nest.nest_id),
          code: formatNestCode(nest.nest_key, Number(nest.nest_id)),
          name: nest.nest_name,
        })),
        assignedNest: {
          id: String(selectedNest.nest_id),
          code: formatNestCode(
            selectedNest.nest_key,
            Number(selectedNest.nest_id),
          ),
          name: selectedNest.nest_name,
          country: selectedNest.country,
          countryName: formatCountry(selectedNest.country),
        },
        allowedTeams,
        items: items.map((item) => {
          const stock = stockByItem.get(item.item_id);

          return {
            id: item.item_id,
            code: item.item_code ?? "",
            name: item.product_name,
            team: item.team,
            category: item.subcategory,
            uom: stock?.unit ?? item.unit,
            stockQuantity:
              stock === undefined ? null : Number(stock.quantity),
            stockUnit: stock?.unit ?? null,
            stockUpdatedAt: stock?.updated_at ?? null,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Nest Lead dashboard GET failed:", error);

    return NextResponse.json(
      { error: "Unable to load Nest Lead dashboard data." },
      { status: 500 },
    );
  }
}