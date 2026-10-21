import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";

type AppUser = NonNullable<Awaited<ReturnType<typeof getUserContext>>>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

type NestRow = {
  nest_id: number;
  nest_key: string | null;
  nest_name: string;
  country: string | null;
};

type CycleRow = {
  cycle_id: string;
  country: string;
  fiscal_year: number;
  quarter: number;
  currency_code: string;
  fx_rate_to_usd: number | string | null;
  status: string;
};

function hasExpenseAccess(user: AppUser) {
  return [
    "it_admin",
    "business_ops_manager",
    "procurement",
    "finance",
    "quartermaster",
    "nest_lead",
  ].some((role) => hasRole(user, role as Parameters<typeof hasRole>[1]));
}

function canManageCountry(user: AppUser, country: string) {
  if (hasRole(user, "it_admin")) return true;

  return (
    (hasRole(user, "business_ops_manager") ||
      hasRole(user, "procurement") ||
      hasRole(user, "finance")) &&
    user.countryAccess.some(
      (value) => value.toLowerCase() === country.toLowerCase(),
    )
  );
}

function canRecordNest(user: AppUser, nestId: number) {
  if (hasRole(user, "it_admin")) return true;

  return (
    (hasRole(user, "quartermaster") || hasRole(user, "nest_lead")) &&
    user.nestAccess.some((access) => Number(access.nestId) === nestId)
  );
}

function currencyFor(country: string): string | null {
  const value = country.trim().toUpperCase();

  if (value === "GH" || value.includes("GHANA")) return "GHS";
  if (value === "RW" || value.includes("RWANDA")) return "RWF";
  if (value === "NG" || value.includes("NIGERIA")) return "NGN";
  if (
    value === "CI" ||
    value.includes("COTE") ||
    value.includes("IVORY")
  ) {
    return "XOF";
  }
  if (value === "KE" || value.includes("KENYA")) return "KES";
  if (value === "US" || value.includes("UNITED STATES")) return "USD";

  return null;
}

function nestCode(nest: NestRow) {
  const match = nest.nest_key?.trim().match(/^([a-z]+)[- _]?(\d+)$/i);
  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nest.nest_id}`;
}

function fail(error: unknown, fallback: string) {
  console.error(fallback, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

function unauthorized() {
  return NextResponse.json(
    { error: "Please sign in with an active application account." },
    { status: 401 },
  );
}

async function getAccessibleNests(
  supabase: Supabase,
  user: AppUser,
): Promise<NestRow[]> {
  const found = new Map<number, NestRow>();
  const query = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  const add = (rows: unknown[] | null) => {
    for (const value of rows ?? []) {
      const nest = value as NestRow;
      found.set(Number(nest.nest_id), {
        ...nest,
        nest_id: Number(nest.nest_id),
      });
    }
  };

  if (hasRole(user, "it_admin")) {
    const { data, error } = await query();
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
    return [...found.values()];
  }

  const countryCodes = [
    ...new Set(user.countryAccess.map((item) => item.trim()).filter(Boolean)),
  ];

  if (countryCodes.length) {
    const { data, error } = await query().in("country", countryCodes);
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
  }

  const nestIds = [
    ...new Set(
      user.nestAccess
        .map((access) => Number(access.nestId))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];

  if (nestIds.length) {
    const { data, error } = await query().in("nest_id", nestIds);
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
  }

  if (user.regionAccess.length) {
    const { data, error } = await supabase
      .from("app_nest_regions")
      .select("nest_id")
      .in("region_id", user.regionAccess);

    if (error) throw new Error(error.message);

    const regionNestIds = [
      ...new Set((data ?? []).map((row) => Number(row.nest_id))),
    ].filter((value) => Number.isSafeInteger(value) && value > 0);

    if (regionNestIds.length) {
      const { data: regionNests, error: regionError } = await query().in(
        "nest_id",
        regionNestIds,
      );
      if (regionError) throw new Error(regionError.message);
      add(regionNests as unknown[] | null);
    }
  }

  return [...found.values()];
}

async function readCycle(supabase: Supabase, cycleId: string) {
  const { data, error } = await supabase
    .from("app_expense_cycles")
    .select(
      "cycle_id, country, fiscal_year, quarter, currency_code, fx_rate_to_usd, status",
    )
    .eq("cycle_id", cycleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as CycleRow | null;
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();
    if (!user?.isActive || !user.hasApplicationAccess) return unauthorized();

    if (!hasExpenseAccess(user)) {
      return NextResponse.json(
        { error: "You do not have access to quarterly expenses." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const allNests = await getAccessibleNests(supabase, user);
    const countries = [
      ...new Set(
        allNests
          .map((nest) => nest.country)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort();

    const params = new URL(request.url).searchParams;
    const country = params.get("country") ?? countries[0] ?? "";

    if (!countries.some((value) => value.toLowerCase() === country.toLowerCase())) {
      return NextResponse.json(
        { error: "You do not have access to this country." },
        { status: 403 },
      );
    }

    const nests = allNests
      .filter((nest) => nest.country?.toLowerCase() === country.toLowerCase())
      .sort((a, b) => a.nest_name.localeCompare(b.nest_name));

    const { data: cycleRows, error: cyclesError } = await supabase
      .from("app_expense_cycles")
      .select(
        "cycle_id, country, fiscal_year, quarter, currency_code, fx_rate_to_usd, status, owner_user_id, source_cycle_id, created_at, updated_at",
      )
      .ilike("country", country)
      .order("fiscal_year", { ascending: false })
      .order("quarter", { ascending: false });

    if (cyclesError) throw new Error(cyclesError.message);

    const cycles = (cycleRows ?? []) as CycleRow[];
    const requestedCycleId = params.get("cycleId");
    const selectedCycle =
      cycles.find((cycle) => cycle.cycle_id === requestedCycleId) ??
      cycles[0] ??
      null;

    const countryCycleIds = cycles.map((cycle) => cycle.cycle_id);
    let historyEntries: Record<string, unknown>[] = [];

    if (countryCycleIds.length) {
      const { data, error } = await supabase
        .from("app_expense_entries")
        .select(
          "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, actual_amount, status, department, gl_code, category, expense_type, description, unit_measure, quantity, unit_cost, comment, created_by, created_at",
        )
        .in("cycle_id", countryCycleIds)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      historyEntries = (data ?? []) as Record<string, unknown>[];
    }

    const selectedEntries = selectedCycle
      ? historyEntries.filter(
          (entry) => entry.cycle_id === selectedCycle.cycle_id,
        )
      : [];

    const [allocationResult, budgetResult, itemResult, vendorResult, assetResult] =
      await Promise.all([
        selectedCycle
          ? supabase
              .from("app_expense_nest_allocations")
              .select(
                "allocation_id, cycle_id, nest_id, allocation_amount, notes, updated_at",
              )
              .eq("cycle_id", selectedCycle.cycle_id)
          : Promise.resolve({ data: [], error: null }),

        selectedCycle
          ? supabase
              .from("app_expense_budgets")
              .select(
                "budget_id, cycle_id, nest_id, department, gl_code, category, budget_amount, notes, scope_type, scope_label, unit_measure, quantity, unit_cost",
              )
              .eq("cycle_id", selectedCycle.cycle_id)
          : Promise.resolve({ data: [], error: null }),

        supabase
          .from("app_expense_catalog_items")
          .select("item_id, item_code, item_name, category")
          .ilike("country", country)
          .eq("is_active", true)
          .order("item_name"),

        supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .ilike("country", country)
          .eq("is_active", true)
          .order("vendor_name"),

        supabase
          .from("app_expense_fuel_assets")
          .select(
            "asset_id, country, nest_id, asset_type, identifier, model, purpose, fuel_type, vendor_name, consumption_rate, consumption_basis, is_active, notes",
          )
          .ilike("country", country)
          .eq("is_active", true)
          .order("identifier"),
      ]);

    for (const result of [
      allocationResult,
      budgetResult,
      itemResult,
      vendorResult,
      assetResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    let fuelPlans: Record<string, unknown>[] = [];
    if (selectedCycle) {
      const { data, error } = await supabase
        .from("app_expense_fuel_plans")
        .select(
          "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, notes",
        )
        .eq("cycle_id", selectedCycle.cycle_id);

      if (error) throw new Error(error.message);
      fuelPlans = (data ?? []) as Record<string, unknown>[];
    }

    const selectedExpenseIds = selectedEntries
      .map((entry) => String(entry.expense_id))
      .filter(Boolean);

    let quotes: Record<string, unknown>[] = [];
    if (selectedExpenseIds.length) {
      const { data, error } = await supabase
        .from("app_expense_vendor_quotes")
        .select(
          "quote_id, expense_id, vendor_id, vendor_name_snapshot, unit_cost, total_cost, note, is_selected",
        )
        .in("expense_id", selectedExpenseIds);

      if (error) throw new Error(error.message);
      quotes = (data ?? []) as Record<string, unknown>[];
    }

    const manageable = canManageCountry(user, country);
    const canRecordNestIds = nests
      .filter((nest) => canRecordNest(user, nest.nest_id))
      .map((nest) => String(nest.nest_id));

    // Country comparison for the same quarter/year. Values are converted only
    // when that quarter has an explicit USD conversion rate.
    let countryComparison: Record<string, unknown>[] = [];
    if (selectedCycle && countries.length) {
      const { data: comparisonCycles, error } = await supabase
        .from("app_expense_cycles")
        .select(
          "cycle_id, country, fiscal_year, quarter, currency_code, fx_rate_to_usd, status",
        )
        .in("country", countries)
        .eq("fiscal_year", selectedCycle.fiscal_year)
        .eq("quarter", selectedCycle.quarter);

      if (error) throw new Error(error.message);

      const comparisonIds = (comparisonCycles ?? []).map(
        (cycle) => cycle.cycle_id,
      );

      const [comparisonAllocations, comparisonEntries] = comparisonIds.length
        ? await Promise.all([
            supabase
              .from("app_expense_nest_allocations")
              .select("cycle_id, allocation_amount")
              .in("cycle_id", comparisonIds),
            supabase
              .from("app_expense_entries")
              .select("cycle_id, amount, actual_amount, status")
              .in("cycle_id", comparisonIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];

      if (comparisonAllocations.error) {
        throw new Error(comparisonAllocations.error.message);
      }
      if (comparisonEntries.error) {
        throw new Error(comparisonEntries.error.message);
      }

      countryComparison = (comparisonCycles ?? []).map((cycle) => {
        const allocations = (comparisonAllocations.data ?? []).filter(
          (row) => row.cycle_id === cycle.cycle_id,
        );
        const entries = (comparisonEntries.data ?? []).filter(
          (row) =>
            row.cycle_id === cycle.cycle_id && row.status !== "rejected",
        );
        const allocated = allocations.reduce(
          (total, row) => total + Number(row.allocation_amount ?? 0),
          0,
        );
        const committed = entries.reduce((total, row) => {
          const amount =
            row.status === "actual" && row.actual_amount != null
              ? Number(row.actual_amount)
              : Number(row.amount ?? 0);
          return total + amount;
        }, 0);
        const rate = Number(cycle.fx_rate_to_usd ?? 0);

        return {
          country: cycle.country,
          currencyCode: cycle.currency_code,
          allocated,
          committed,
          remaining: allocated - committed,
          allocatedUsd: rate > 0 ? allocated * rate : null,
          committedUsd: rate > 0 ? committed * rate : null,
          remainingUsd: rate > 0 ? (allocated - committed) * rate : null,
          fxRateToUsd: rate || null,
        };
      });
    }

    return NextResponse.json(
      {
        countries,
        country,
        currencyCode:
          selectedCycle?.currency_code ?? currencyFor(country) ?? "USD",
        nests: nests.map((nest) => ({
          id: String(nest.nest_id),
          code: nestCode(nest),
          name: nest.nest_name,
        })),
        cycles: cycleRows ?? [],
        selectedCycle,
        allocations: allocationResult.data ?? [],
        budgetLines: budgetResult.data ?? [],
        entries: selectedEntries,
        historyEntries,
        items: itemResult.data ?? [],
        vendors: vendorResult.data ?? [],
        fuelAssets: assetResult.data ?? [],
        fuelPlans,
        quotes,
        countryComparison,
        permissions: {
          canManageCountry: manageable,
          canRecordNestIds,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error, "Unable to load quarterly expense data.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserContext();
    if (!user?.isActive || !user.hasApplicationAccess) return unauthorized();

    if (!hasExpenseAccess(user)) {
      return NextResponse.json(
        { error: "You do not have access to quarterly expenses." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = await createClient();
    const now = new Date().toISOString();

    if (action === "create_cycle") {
      const country = String(body.country ?? "").trim();
      const fiscalYear = Number(body.fiscalYear);
      const quarter = Number(body.quarter);
      const fxRate = body.fxRateToUsd ? Number(body.fxRateToUsd) : null;
      const currencyCode = currencyFor(country);

      if (!canManageCountry(user, country)) {
        return NextResponse.json(
          { error: "You cannot manage this country." },
          { status: 403 },
        );
      }

      if (
        !currencyCode ||
        !Number.isInteger(fiscalYear) ||
        fiscalYear < 2020 ||
        fiscalYear > 2100 ||
        !Number.isInteger(quarter) ||
        quarter < 1 ||
        quarter > 4 ||
        (fxRate !== null && (!Number.isFinite(fxRate) || fxRate <= 0))
      ) {
        return NextResponse.json(
          { error: "Enter a valid country, year, quarter, and exchange rate." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_cycles")
        .insert({
          country,
          fiscal_year: fiscalYear,
          quarter,
          currency_code: currencyCode,
          fx_rate_to_usd: fxRate,
          status: "draft",
          owner_user_id: user.userId,
          created_by: user.userId,
        })
        .select(
          "cycle_id, country, fiscal_year, quarter, currency_code, fx_rate_to_usd, status, owner_user_id, source_cycle_id, created_at, updated_at",
        )
        .single();

      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "A quarter already exists for that country and period." },
          { status: 409 },
        );
      }
      if (error) throw new Error(error.message);
      return NextResponse.json({ cycle: data }, { status: 201 });
    }

    if (action === "add_vendor" || action === "add_item") {
      const country = String(body.country ?? "").trim();
      if (!canManageCountry(user, country)) {
        return NextResponse.json(
          { error: "You cannot manage this country’s catalog." },
          { status: 403 },
        );
      }

      if (action === "add_vendor") {
        const vendorName = String(body.vendorName ?? "").trim();
        if (!vendorName) {
          return NextResponse.json(
            { error: "Enter a vendor name." },
            { status: 400 },
          );
        }

        const { data, error } = await supabase
          .from("app_expense_catalog_vendors")
          .insert({ country, vendor_name: vendorName, is_active: true })
          .select("vendor_id, vendor_name")
          .single();

        if (error?.code === "23505") {
          return NextResponse.json(
            { error: "That vendor is already listed for this country." },
            { status: 409 },
          );
        }
        if (error) throw new Error(error.message);
        return NextResponse.json({ vendor: data }, { status: 201 });
      }

      const itemCode = String(body.itemCode ?? "").trim();
      const itemName = String(body.itemName ?? "").trim();
      const category = String(body.category ?? "").trim();

      if (!itemCode || !itemName || !category) {
        return NextResponse.json(
          { error: "Enter an item code, item name, and category." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_catalog_items")
        .insert({
          country,
          item_code: itemCode,
          item_name: itemName,
          category,
          is_active: true,
        })
        .select("item_id, item_code, item_name, category")
        .single();

      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "That item code is already listed for this country." },
          { status: 409 },
        );
      }
      if (error) throw new Error(error.message);
      return NextResponse.json({ item: data }, { status: 201 });
    }

    const cycleId = String(body.cycleId ?? "");
    if (!cycleId) {
      return NextResponse.json(
        { error: "Select a quarter." },
        { status: 400 },
      );
    }

    const cycle = await readCycle(supabase, cycleId);
    if (!cycle) {
      return NextResponse.json(
        { error: "Quarter not found." },
        { status: 404 },
      );
    }

    const manager = canManageCountry(user, cycle.country);

    if (action === "set_cycle_status") {
      const status = String(body.status ?? "");
      const allowed =
        (cycle.status === "draft" && status === "open") ||
        (cycle.status === "open" && status === "closed");

      if (!manager || !allowed) {
        return NextResponse.json(
          { error: "That quarter status change is not allowed." },
          { status: 403 },
        );
      }

      const { error } = await supabase
        .from("app_expense_cycles")
        .update({ status, updated_at: now })
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, status });
    }

    if (action === "save_fx_rate") {
      const rate = Number(body.fxRateToUsd);
      if (!manager || !Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: "Enter a valid USD conversion rate." },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("app_expense_cycles")
        .update({ fx_rate_to_usd: rate, fx_rate_source: "manual", updated_at: now })
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, fxRateToUsd: rate });
    }

    if (action === "save_allocation") {
      if (!manager || cycle.status === "closed") {
        return NextResponse.json(
          { error: "This quarter’s allocation cannot be changed." },
          { status: 403 },
        );
      }

      const nestId = Number(body.nestId);
      const allocationAmount = Number(body.allocationAmount);
      if (
        !Number.isSafeInteger(nestId) ||
        nestId <= 0 ||
        !Number.isFinite(allocationAmount) ||
        allocationAmount < 0
      ) {
        return NextResponse.json(
          { error: "Enter a valid nest and allocation amount." },
          { status: 400 },
        );
      }

      const { data: nest, error: nestError } = await supabase
        .from("company_nests")
        .select("nest_id, country")
        .eq("nest_id", nestId)
        .eq("is_production_nest", true)
        .maybeSingle();

      if (nestError) throw new Error(nestError.message);
      if (!nest || nest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json(
          { error: "Choose a production nest in this country." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_nest_allocations")
        .upsert(
          {
            cycle_id: cycleId,
            nest_id: nestId,
            allocation_amount: allocationAmount,
            notes: String(body.notes ?? "").trim() || null,
            created_by: user.userId,
            updated_by: user.userId,
            updated_at: now,
          },
          { onConflict: "cycle_id,nest_id" },
        )
        .select(
          "allocation_id, cycle_id, nest_id, allocation_amount, notes, updated_at",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ allocation: data });
    }

    if (action === "save_budget_line") {
      if (!manager || cycle.status === "closed") {
        return NextResponse.json(
          { error: "Only country planners can edit budget lines." },
          { status: 403 },
        );
      }

      const nestId = body.nestId ? Number(body.nestId) : null;
      const budgetAmount = Number(body.budgetAmount);
      const scopeType = String(body.scopeType ?? "nest");
      const allowedScopes = [
        "nest",
        "country",
        "hq",
        "central",
        "donor_program",
        "other",
      ];

      if (
        (nestId !== null && (!Number.isSafeInteger(nestId) || nestId <= 0)) ||
        !Number.isFinite(budgetAmount) ||
        budgetAmount < 0 ||
        !allowedScopes.includes(scopeType)
      ) {
        return NextResponse.json(
          { error: "Enter valid budget line details." },
          { status: 400 },
        );
      }

      if (nestId !== null) {
        const { data: nest, error } = await supabase
          .from("company_nests")
          .select("nest_id, country")
          .eq("nest_id", nestId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!nest || nest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
          return NextResponse.json(
            { error: "The selected nest must belong to this country." },
            { status: 400 },
          );
        }
      }

      const { data, error } = await supabase
        .from("app_expense_budgets")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          scope_type: scopeType,
          scope_label: String(body.scopeLabel ?? "").trim() || null,
          department: String(body.department ?? "").trim() || null,
          gl_code: String(body.glCode ?? "").trim() || null,
          category: String(body.category ?? "").trim() || null,
          budget_amount: budgetAmount,
          unit_measure: String(body.unitMeasure ?? "").trim() || null,
          quantity: body.quantity ? Number(body.quantity) : null,
          unit_cost: body.unitCost ? Number(body.unitCost) : null,
          notes: String(body.notes ?? "").trim() || null,
          created_by: user.userId,
        })
        .select(
          "budget_id, cycle_id, nest_id, department, gl_code, category, budget_amount, notes, scope_type, scope_label, unit_measure, quantity, unit_cost",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ budgetLine: data }, { status: 201 });
    }

    if (action === "add_expense") {
      if (cycle.status !== "open") {
        return NextResponse.json(
          { error: "This quarter is not open for entries." },
          { status: 409 },
        );
      }

      const nestId = Number(body.nestId);
      const itemId = String(body.itemId ?? "");
      const vendorId = String(body.vendorId ?? "");
      const quantity = Number(body.quantity);
      const unitCost = Number(body.unitCost);
      const amount = Number(body.amount);
      const status = String(body.status ?? "planned");

      if (!canRecordNest(user, nestId)) {
        return NextResponse.json(
          { error: "You can only record expenses for a nest assigned to you." },
          { status: 403 },
        );
      }

      if (
        !itemId ||
        !vendorId ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitCost) ||
        unitCost < 0 ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !["planned", "in_review", "actual"].includes(status)
      ) {
        return NextResponse.json(
          { error: "Complete the item, vendor, quantity, and cost fields." },
          { status: 400 },
        );
      }

      const { data: nest, error: nestError } = await supabase
        .from("company_nests")
        .select("nest_id, country")
        .eq("nest_id", nestId)
        .eq("is_production_nest", true)
        .maybeSingle();

      if (nestError) throw new Error(nestError.message);
      if (!nest || nest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json(
          { error: "The nest must belong to this quarter’s country." },
          { status: 400 },
        );
      }

      const [itemResult, vendorResult, allocationResult] = await Promise.all([
        supabase
          .from("app_expense_catalog_items")
          .select("item_id, item_code, item_name, category")
          .eq("item_id", itemId)
          .ilike("country", cycle.country)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .eq("vendor_id", vendorId)
          .ilike("country", cycle.country)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("app_expense_nest_allocations")
          .select("allocation_id")
          .eq("cycle_id", cycleId)
          .eq("nest_id", nestId)
          .maybeSingle(),
      ]);

      if (itemResult.error) throw new Error(itemResult.error.message);
      if (vendorResult.error) throw new Error(vendorResult.error.message);
      if (allocationResult.error) throw new Error(allocationResult.error.message);

      if (!itemResult.data || !vendorResult.data) {
        return NextResponse.json(
          { error: "Choose an active item and vendor for this country." },
          { status: 400 },
        );
      }
      if (!allocationResult.data) {
        return NextResponse.json(
          { error: "This nest has no allocation for the selected quarter." },
          { status: 409 },
        );
      }

      const description = String(body.description ?? "").trim();
      const comment = String(body.comment ?? "").trim();
      const expenseType = String(body.expenseType ?? "one_off");
      const actualAmount = status === "actual" ? amount : null;

      const { data: expense, error } = await supabase
        .from("app_expense_entries")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          item_id: itemId,
          vendor_id: vendorId,
          item_code_snapshot: itemResult.data.item_code,
          item_name_snapshot: itemResult.data.item_name,
          vendor_name_snapshot: vendorResult.data.vendor_name,
          amount,
          actual_amount: actualAmount,
          status,
          department: String(body.department ?? "").trim() || null,
          gl_code: String(body.glCode ?? "").trim() || null,
          category: String(body.category ?? itemResult.data.category ?? "").trim() || null,
          expense_type: expenseType,
          description,
          unit_measure: String(body.unitMeasure ?? "").trim() || null,
          quantity,
          unit_cost: unitCost,
          comment,
          created_by: user.userId,
        })
        .select(
          "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, actual_amount, status, department, gl_code, category, expense_type, description, unit_measure, quantity, unit_cost, comment, created_by, created_at",
        )
        .single();

      if (error) throw new Error(error.message);

      const quoteRows = Array.isArray(body.quotes)
        ? (body.quotes as Array<Record<string, unknown>>)
        : [];

      const vendorsToQuote = [
        {
          vendorId,
          unitCost,
          totalCost: amount,
          note: "Selected vendor",
          isSelected: true,
        },
        ...quoteRows.map((quote) => ({
          vendorId: String(quote.vendorId ?? ""),
          unitCost: Number(quote.unitCost),
          totalCost: Number(quote.totalCost),
          note: String(quote.note ?? ""),
          isSelected: false,
        })),
      ].filter(
        (quote) =>
          quote.vendorId &&
          Number.isFinite(quote.unitCost) &&
          quote.unitCost >= 0 &&
          Number.isFinite(quote.totalCost) &&
          quote.totalCost >= 0,
      );

      if (vendorsToQuote.length) {
        const vendorIds = [...new Set(vendorsToQuote.map((quote) => quote.vendorId))];
        const { data: quoteVendors, error: quoteVendorError } = await supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .in("vendor_id", vendorIds)
          .ilike("country", cycle.country)
          .eq("is_active", true);

        if (quoteVendorError) throw new Error(quoteVendorError.message);

        const vendorById = new Map(
          (quoteVendors ?? []).map((vendor) => [
            vendor.vendor_id,
            vendor.vendor_name,
          ]),
        );

        const inserts = vendorsToQuote
          .filter((quote) => vendorById.has(quote.vendorId))
          .map((quote) => ({
            expense_id: expense.expense_id,
            vendor_id: quote.vendorId,
            vendor_name_snapshot: vendorById.get(quote.vendorId),
            unit_cost: quote.unitCost,
            total_cost: quote.totalCost,
            note: quote.note || null,
            is_selected: quote.isSelected,
            created_by: user.userId,
            updated_at: now,
          }));

        if (inserts.length) {
          const { error: quoteError } = await supabase
            .from("app_expense_vendor_quotes")
            .upsert(inserts, {
              onConflict: "expense_id,vendor_name_snapshot",
            });
          if (quoteError) throw new Error(quoteError.message);
        }
      }

      return NextResponse.json({ expense }, { status: 201 });
    }

    if (action === "review_expense") {
      const expenseId = String(body.expenseId ?? "");
      const status = String(body.status ?? "");
      if (
        !manager ||
        !expenseId ||
        !["approved", "rejected", "actual"].includes(status)
      ) {
        return NextResponse.json(
          { error: "You cannot review this expense." },
          { status: 403 },
        );
      }

      const { data: current, error: currentError } = await supabase
        .from("app_expense_entries")
        .select("expense_id, created_by, amount")
        .eq("expense_id", expenseId)
        .eq("cycle_id", cycleId)
        .maybeSingle();

      if (currentError) throw new Error(currentError.message);
      if (!current) {
        return NextResponse.json(
          { error: "Expense entry not found." },
          { status: 404 },
        );
      }
      if (current.created_by === user.userId) {
        return NextResponse.json(
          { error: "You cannot review an entry you created." },
          { status: 403 },
        );
      }

      const actualAmount =
        status === "actual"
          ? Number(body.actualAmount ?? current.amount)
          : null;

      if (
        status === "actual" &&
        (!Number.isFinite(actualAmount) || actualAmount! < 0)
      ) {
        return NextResponse.json(
          { error: "Enter a valid actual amount." },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("app_expense_entries")
        .update({
          status,
          actual_amount: actualAmount,
          reviewed_by: user.userId,
          reviewed_at: now,
          review_note: String(body.reviewNote ?? "").trim() || null,
        })
        .eq("expense_id", expenseId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ expenseId, status });
    }

    if (action === "add_fuel_asset") {
      const nestId = Number(body.nestId);
      const country = String(body.country ?? cycle.country).trim();
      const assetType = String(body.assetType ?? "");
      const identifier = String(body.identifier ?? "").trim();
      const allowedTypes = ["vehicle", "generator", "fuel_card", "other"];

      if (
        country.toLowerCase() !== cycle.country.toLowerCase() ||
        !allowedTypes.includes(assetType) ||
        !identifier ||
        !canManageCountry(user, country) && !canRecordNest(user, nestId)
      ) {
        return NextResponse.json(
          { error: "Enter a valid asset for this country and nest." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_fuel_assets")
        .insert({
          country,
          nest_id: nestId || null,
          asset_type: assetType,
          identifier,
          model: String(body.model ?? "").trim() || null,
          purpose: String(body.purpose ?? "").trim() || null,
          fuel_type: String(body.fuelType ?? "").trim() || null,
          vendor_name: String(body.vendorName ?? "").trim() || null,
          consumption_rate: body.consumptionRate
            ? Number(body.consumptionRate)
            : null,
          consumption_basis: body.consumptionBasis || null,
          notes: String(body.notes ?? "").trim() || null,
          created_by: user.userId,
          updated_at: now,
        })
        .select(
          "asset_id, country, nest_id, asset_type, identifier, model, purpose, fuel_type, vendor_name, consumption_rate, consumption_basis, is_active, notes",
        )
        .single();

      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "That asset identifier already exists in this country." },
          { status: 409 },
        );
      }
      if (error) throw new Error(error.message);
      return NextResponse.json({ asset: data }, { status: 201 });
    }

    if (action === "save_fuel_plan") {
      const assetId = String(body.assetId ?? "");
      const nestId = Number(body.nestId);
      const monthlyActivity = Number(body.projectedMonthlyActivity);
      const consumptionRate = Number(body.consumptionRate);
      const consumptionBasis = String(body.consumptionBasis ?? "");
      const costPerLitre = Number(body.costPerLitre);

      if (
        cycle.status === "closed" ||
        !assetId ||
        !canManageCountry(user, cycle.country) && !canRecordNest(user, nestId) ||
        !Number.isFinite(monthlyActivity) ||
        monthlyActivity < 0 ||
        !Number.isFinite(consumptionRate) ||
        consumptionRate < 0 ||
        !Number.isFinite(costPerLitre) ||
        costPerLitre < 0 ||
        !["per_100km", "per_hour"].includes(consumptionBasis)
      ) {
        return NextResponse.json(
          { error: "Enter valid fuel planning details." },
          { status: 400 },
        );
      }

      const { data: asset, error: assetError } = await supabase
        .from("app_expense_fuel_assets")
        .select("asset_id, country, nest_id")
        .eq("asset_id", assetId)
        .eq("is_active", true)
        .maybeSingle();

      if (assetError) throw new Error(assetError.message);
      if (!asset || asset.country.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json(
          { error: "Choose an active asset for this country." },
          { status: 400 },
        );
      }

      const planNestId = asset.nest_id ?? nestId;
      const { data, error } = await supabase
        .from("app_expense_fuel_plans")
        .upsert(
          {
            cycle_id: cycleId,
            asset_id: assetId,
            nest_id: planNestId,
            projected_monthly_activity: monthlyActivity,
            consumption_rate: consumptionRate,
            consumption_basis: consumptionBasis,
            cost_per_litre: costPerLitre,
            notes: String(body.notes ?? "").trim() || null,
            created_by: user.userId,
            updated_at: now,
          },
          { onConflict: "cycle_id,asset_id" },
        )
        .select(
          "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, notes",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ fuelPlan: data });
    }

    return NextResponse.json(
      { error: "Unsupported expense action." },
      { status: 400 },
    );
  } catch (error) {
    return fail(error, "Unable to save quarterly expense data.");
  }
}