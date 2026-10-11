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

type PlanInputLine = {
  itemId: string;
  quantities: Record<string, number | string | null | undefined>;
};

type PlanItemRow = {
  item_id: string;
  unit_cost: number | string | null;
  currency_code: string | null;
  is_active: boolean;
};

type CreatedPlanLine = {
  line_id: string;
  item_id: string;
};

function canManagePlans(user: AppUser): boolean {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "business_ops_manager") ||
    hasRole(user, "procurement")
  );
}

function currencyFor(country: string | null): string | null {
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

function formatNestCode(nest: NestRow): string {
  const match = nest.nest_key?.trim().match(/^([a-z]+)[-_\s]?(\d+)$/i);

  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nest.nest_id}`;
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

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error);

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    { status: 500 },
  );
}

function asPlanInputLines(value: unknown): PlanInputLine[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const lines: PlanInputLine[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const line = entry as Record<string, unknown>;

    if (typeof line.itemId !== "string" || !line.itemId) {
      return null;
    }

    const quantities =
      line.quantities && typeof line.quantities === "object"
        ? (line.quantities as Record<
            string,
            number | string | null | undefined
          >)
        : {};

    lines.push({
      itemId: line.itemId,
      quantities,
    });
  }

  return lines;
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

    if (!canManagePlans(user)) {
      return NextResponse.json(
        { error: "You do not have access to stock plans." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);

    const countries = [
      ...new Set(
        nests
          .map((nest) => nest.country)
          .filter((country): country is string => Boolean(country)),
      ),
    ].sort();

    if (nests.length === 0 || countries.length === 0) {
      return NextResponse.json(
        { error: "No accessible production nests were found." },
        { status: 404 },
      );
    }

    const requestedCountry = new URL(request.url).searchParams.get("country");
    const country = requestedCountry ?? countries[0];

    if (!country || !countries.includes(country)) {
      return NextResponse.json(
        { error: "You do not have access to this country." },
        { status: 403 },
      );
    }

    const countryNests = nests.filter((nest) => nest.country === country);
    const currencyCode = currencyFor(country);

    if (!currencyCode) {
      return NextResponse.json(
        { error: `No currency mapping is configured for ${country}.` },
        { status: 400 },
      );
    }

    const { data: itemData, error: itemsError } = await supabase
      .from("app_items")
      .select(
        "item_id, item_code, product_name, team, subcategory, unit, unit_cost, currency_code",
      )
      .eq("country", country)
      .eq("is_active", true)
      .order("product_name", { ascending: true });

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    const items = (itemData ?? []) as unknown as Array<{
      item_id: string;
      item_code: string | null;
      product_name: string;
      team: string;
      subcategory: string | null;
      unit: string;
      unit_cost: number | string | null;
      currency_code: string | null;
    }>;

    return NextResponse.json(
      {
        countries,
        country,
        currencyCode,
        nests: countryNests.map((nest) => ({
          id: String(nest.nest_id),
          code: formatNestCode(nest),
          name: nest.nest_name,
          country: nest.country,
        })),
        items: items.map((item) => ({
          id: item.item_id,
          code: item.item_code ?? "",
          name: item.product_name,
          team: item.team,
          category: item.subcategory,
          uom: item.unit,
          unitCost:
            item.unit_cost === null ? null : Number(item.unit_cost),
          currencyCode: item.currency_code ?? currencyCode,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return errorResponse(error, "Unable to load stock plan data.");
  }
}

export async function POST(request: Request) {
  let createdPlanId: string | null = null;
  let isNewPlan = false;

  try {
    const user = await getUserContext();

    if (!user?.isActive || !user.hasApplicationAccess) {
      return NextResponse.json(
        { error: "Please sign in with an active application account." },
        { status: 401 },
      );
    }

    if (!canManagePlans(user)) {
      return NextResponse.json(
        { error: "You do not have access to stock plans." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);

    const country = String(body.country ?? "").trim().toUpperCase();
    const availableNests = nests.filter(
      (nest) => (nest.country ?? "").trim().toUpperCase() === country,
    );
    const currencyCode = currencyFor(country);

    if (availableNests.length === 0 || !currencyCode) {
      return NextResponse.json(
        { error: "You do not have access to this country." },
        { status: 403 },
      );
    }

    const planName = String(body.planName ?? "").trim();
    const period = String(body.period ?? "").trim();
    const frequency = String(body.frequency ?? "").trim().toLowerCase();

    if (!planName || !period) {
      return NextResponse.json(
        { error: "Enter a plan name and period." },
        { status: 400 },
      );
    }

    if (frequency !== "monthly" && frequency !== "quarterly") {
      return NextResponse.json(
        { error: "Choose a valid plan frequency." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.nestIds)) {
      return NextResponse.json(
        { error: "Select one or more accessible nests." },
        { status: 400 },
      );
    }

    const selectedNestIds = [
      ...new Set(
        (body.nestIds as unknown[])
          .map((id) => String(id))
          .filter(Boolean),
      ),
    ];

    const allowedNestIds = new Set(
      availableNests.map((nest) => String(nest.nest_id)),
    );

    if (
      selectedNestIds.length === 0 ||
      selectedNestIds.some((id) => !allowedNestIds.has(id))
    ) {
      return NextResponse.json(
        { error: "Select only nests you can access in this country." },
        { status: 400 },
      );
    }

    const planLines = asPlanInputLines(body.lines);

    if (!planLines || planLines.length === 0) {
      return NextResponse.json(
        { error: "Add at least one valid item to the plan." },
        { status: 400 },
      );
    }

    const itemIds = [...new Set(planLines.map((line) => line.itemId))];

    const { data: itemData, error: itemError } = await supabase
      .from("app_items")
      .select("item_id, unit_cost, currency_code, is_active")
      .eq("country", country)
      .in("item_id", itemIds);

    if (itemError) {
      throw new Error(itemError.message);
    }

    const itemRows = (itemData ?? []) as unknown as PlanItemRow[];
    const itemMap = new Map(itemRows.map((item) => [item.item_id, item]));

    for (const line of planLines) {
      const item = itemMap.get(line.itemId);

      if (!item || !item.is_active || item.unit_cost === null) {
        return NextResponse.json(
          { error: "Every plan item must be active and have a unit price." },
          { status: 400 },
        );
      }

      if (item.currency_code && item.currency_code !== currencyCode) {
        return NextResponse.json(
          { error: "An item currency does not match the plan country." },
          { status: 400 },
        );
      }

      for (const nestId of selectedNestIds) {
        const quantity = line.quantities[nestId];

        if (quantity === null || quantity === undefined || quantity === "") {
          continue;
        }

        const numericQuantity = Number(quantity);

        if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
          return NextResponse.json(
            { error: "Plan quantities must be zero or greater." },
            { status: 400 },
          );
        }
      }
    }

    const requestedPlanId = body.planId ? String(body.planId) : null;

    if (requestedPlanId) {
      const { data: existingPlan, error: existingPlanError } = await supabase
        .from("app_stock_plans")
        // Include country here because it is checked below.
        .select("plan_id, status, created_by, country")
        .eq("plan_id", requestedPlanId)
        .maybeSingle();

      if (existingPlanError) {
        throw new Error(existingPlanError.message);
      }

      if (
        !existingPlan ||
        existingPlan.created_by !== user.userId ||
        existingPlan.status !== "draft" ||
        existingPlan.country !== country
      ) {
        return NextResponse.json(
          { error: "Only your own draft plan for this country can be updated." },
          { status: 403 },
        );
      }

      createdPlanId = requestedPlanId;

      const { error: deleteLinesError } = await supabase
        .from("app_stock_plan_lines")
        .delete()
        .eq("plan_id", createdPlanId);

      if (deleteLinesError) {
        throw new Error(deleteLinesError.message);
      }

      const { error: deleteNestsError } = await supabase
        .from("app_stock_plan_nests")
        .delete()
        .eq("plan_id", createdPlanId);

      if (deleteNestsError) {
        throw new Error(deleteNestsError.message);
      }
    } else {
      const { data: plan, error: planError } = await supabase
        .from("app_stock_plans")
        .insert({
          plan_name: planName,
          country,
          frequency,
          period,
          currency_code: currencyCode,
          status: "draft",
          created_by: user.userId,
        })
        .select("plan_id")
        .single();

      if (planError) {
        throw new Error(planError.message);
      }

      createdPlanId = plan.plan_id;
      isNewPlan = true;
    }

    if (!createdPlanId) {
      throw new Error("The stock plan could not be created.");
    }

    const { error: nestsError } = await supabase
      .from("app_stock_plan_nests")
      .insert(
        selectedNestIds.map((id) => ({
          plan_id: createdPlanId,
          nest_id: Number(id),
        })),
      );

    if (nestsError) {
      throw new Error(nestsError.message);
    }

    const { data: createdLineData, error: linesError } = await supabase
      .from("app_stock_plan_lines")
      .insert(
        planLines.map((line) => {
          const item = itemMap.get(line.itemId);

          return {
            plan_id: createdPlanId,
            item_id: line.itemId,
            default_quantity: 0,
            unit_cost_snapshot: Number(item?.unit_cost),
          };
        }),
      )
      .select("line_id, item_id");

    if (linesError) {
      throw new Error(linesError.message);
    }

    const createdLines = (createdLineData ?? []) as unknown as CreatedPlanLine[];
    const lineByItemId = new Map(
      createdLines.map((line) => [line.item_id, line.line_id]),
    );

    const quantityRows: Array<{
      line_id: string;
      nest_id: number;
      quantity: number;
    }> = [];

    for (const line of planLines) {
      const lineId = lineByItemId.get(line.itemId);

      if (!lineId) {
        continue;
      }

      for (const nestId of selectedNestIds) {
        const quantity = line.quantities[nestId];

        if (quantity === null || quantity === undefined || quantity === "") {
          continue;
        }

        quantityRows.push({
          line_id: lineId,
          nest_id: Number(nestId),
          quantity: Number(quantity),
        });
      }
    }

    if (quantityRows.length > 0) {
      const { error: quantitiesError } = await supabase
        .from("app_stock_plan_quantities")
        .insert(quantityRows);

      if (quantitiesError) {
        throw new Error(quantitiesError.message);
      }
    }

    const mode =
      body.mode === "submit" ? "pending_finance_review" : "draft";

    const { error: updateError } = await supabase
      .from("app_stock_plans")
      .update({
        plan_name: planName,
        country,
        frequency,
        period,
        currency_code: currencyCode,
        status: mode,
        submitted_at:
          mode === "pending_finance_review"
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", createdPlanId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      planId: createdPlanId,
      status: mode,
    });
  } catch (error) {
    if (createdPlanId && isNewPlan) {
      try {
        const supabase = await createClient();

        await supabase
          .from("app_stock_plans")
          .delete()
          .eq("plan_id", createdPlanId);
      } catch (cleanupError) {
        console.error("Failed to clean up incomplete stock plan:", cleanupError);
      }
    }

    return errorResponse(error, "Unable to save the stock plan.");
  }
}