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

function hasAccess(user: AppUser) {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "business_ops_manager") ||
    hasRole(user, "procurement") ||
    hasRole(user, "finance") ||
    hasRole(user, "quartermaster") ||
    hasRole(user, "nest_lead")
  );
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

function unauthorized() {
  return NextResponse.json(
    { error: "Please sign in with an active application account." },
    { status: 401 },
  );
}

function fail(error: unknown, fallback: string) {
  console.error(fallback, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

function camelizeRequestKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeRequestKeys);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        camelizeRequestKeys(entry),
      ]),
    );
  }

  return value;
}

function normalizeRequestBody(value: unknown): Record<string, unknown> {
  const normalized = camelizeRequestKeys(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }

  const body = normalized as Record<string, unknown>;
  const quarter = String(body.quarter ?? "").trim();
  const quarterMatch = quarter.match(/^Q([1-4])$/i);

  if (quarterMatch) body.quarter = Number(quarterMatch[1]);

  return body;
}

async function accessibleNests(
  supabase: Supabase,
  user: AppUser,
): Promise<NestRow[]> {
  const found = new Map<number, NestRow>();
  const baseQuery = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  const addRows = (rows: unknown[] | null) => {
    for (const value of rows ?? []) {
      const row = value as NestRow;
      found.set(Number(row.nest_id), {
        ...row,
        nest_id: Number(row.nest_id),
      });
    }
  };

  if (hasRole(user, "it_admin")) {
    const { data, error } = await baseQuery();
    if (error) throw new Error(error.message);
    addRows(data as unknown[] | null);
    return [...found.values()];
  }

  const countries = [
    ...new Set(user.countryAccess.map((value) => value.trim()).filter(Boolean)),
  ];

  if (countries.length) {
    const { data, error } = await baseQuery().in("country", countries);
    if (error) throw new Error(error.message);
    addRows(data as unknown[] | null);
  }

  const assignedIds = [
    ...new Set(
      user.nestAccess
        .map((access) => Number(access.nestId))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];

  if (assignedIds.length) {
    const { data, error } = await baseQuery().in("nest_id", assignedIds);
    if (error) throw new Error(error.message);
    addRows(data as unknown[] | null);
  }

  if (user.regionAccess.length) {
    const { data, error } = await supabase
      .from("app_nest_regions")
      .select("nest_id")
      .in("region_id", user.regionAccess);

    if (error) throw new Error(error.message);

    const ids = [
      ...new Set((data ?? []).map((row) => Number(row.nest_id))),
    ].filter((id) => Number.isSafeInteger(id) && id > 0);

    if (ids.length) {
      const { data: regionalNests, error: regionalError } = await baseQuery().in(
        "nest_id",
        ids,
      );
      if (regionalError) throw new Error(regionalError.message);
      addRows(regionalNests as unknown[] | null);
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

    if (!hasAccess(user)) {
      return NextResponse.json(
        { error: "You do not have access to expense planning." },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const allNests = await accessibleNests(supabase, user);
    const countries = [
      ...new Set(
        allNests
          .map((nest) => nest.country)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort();

    const params = new URL(request.url).searchParams;
    const requestedCycleId = params.get("cycleId");
    const requestedCountry = params.get("country");
    let cycleCountry: string | null = null;

    if (requestedCycleId) {
      const { data: cycleScope, error: scopeError } = await supabase
        .from("app_expense_cycles")
        .select("country")
        .eq("cycle_id", requestedCycleId)
        .maybeSingle();
      if (scopeError) throw new Error(scopeError.message);
      if (!cycleScope?.country) {
        return NextResponse.json({ error: "Quarter not found." }, { status: 404 });
      }
      cycleCountry = cycleScope?.country ?? null;
    }

    // A quarter ID is authoritative. This prevents a stale/default country
    // selection from loading a different country's workspace.
    const country =
      cycleCountry ?? requestedCountry ?? (countries.length === 1 ? countries[0] : "");

    if (
      country &&
      !countries.some((value) => value.toLowerCase() === country.toLowerCase())
    ) {
      return NextResponse.json(
        { error: "You do not have access to this country." },
        { status: 403 },
      );
    }

    const nests = allNests
      .filter((nest) => nest.country?.toLowerCase() === country.toLowerCase())
      .sort((a, b) => a.nest_name.localeCompare(b.nest_name));

    const { data: cycleRows, error: cycleError } = await supabase
      .from("app_expense_cycles")
      .select(
        "cycle_id, country, fiscal_year, quarter, currency_code, fx_rate_to_usd, status, owner_user_id, source_cycle_id, created_at, updated_at, submitted_at, approved_at, approval_note",
      )
      .ilike("country", country)
      .order("fiscal_year", { ascending: false })
      .order("quarter", { ascending: false });

    if (cycleError) throw new Error(cycleError.message);

    const cycles = (cycleRows ?? []) as CycleRow[];
    const selectedCycle = requestedCycleId
      ? cycles.find((cycle) => cycle.cycle_id === requestedCycleId) ?? null
      : cycles[0] ?? null;
    if (requestedCycleId && !selectedCycle) {
      return NextResponse.json({ error: "Quarter not found." }, { status: 404 });
    }

    // The planning index only needs country access and quarter summaries.
    // Skip expense, plan, fuel, and vendor quote reads until a quarter is opened.
    if (params.get("directory") === "1") {
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
          selectedCycle: null,
          permissions: {
            canManageCountry: Boolean(country) && canManageCountry(user, country),
            canRecordNestIds: nests
              .filter((nest) => canRecordNest(user, nest.nest_id))
              .map((nest) => String(nest.nest_id)),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const cycleIds = cycles.map((cycle) => cycle.cycle_id);

    let historyEntries: Record<string, unknown>[] = [];
    let historyAllocations: Record<string, unknown>[] = [];
    let historyFuelPlans: Record<string, unknown>[] = [];

    if (cycleIds.length) {
      const [entriesResult, allocationsResult, fuelResult] = await Promise.all([
        supabase
          .from("app_expense_entries")
          .select(
            "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, actual_amount, status, department, gl_code, category, expense_type, description, unit_measure, quantity, unit_cost, comment, summary_group, team, blanket_po, created_by, created_at, review_note",
          )
          .in("cycle_id", cycleIds)
          .order("created_at", { ascending: false }),

        supabase
          .from("app_expense_nest_allocations")
          .select("allocation_id, cycle_id, nest_id, allocation_amount, notes")
          .in("cycle_id", cycleIds),

        supabase
          .from("app_expense_fuel_plans")
          .select(
            "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, vendor_id, vendor_name_snapshot, actual_monthly_activity, actual_quarterly_litres, actual_quarterly_cost, actual_notes",
          )
          .in("cycle_id", cycleIds),
      ]);

      if (entriesResult.error) throw new Error(entriesResult.error.message);
      if (allocationsResult.error) throw new Error(allocationsResult.error.message);
      if (fuelResult.error) throw new Error(fuelResult.error.message);

      historyEntries = (entriesResult.data ?? []) as Record<string, unknown>[];
      historyAllocations = (allocationsResult.data ?? []) as Record<string, unknown>[];
      historyFuelPlans = (fuelResult.data ?? []) as Record<string, unknown>[];
    }

    const entries = selectedCycle
      ? historyEntries.filter((row) => row.cycle_id === selectedCycle.cycle_id)
      : [];
    const allocations = selectedCycle
      ? historyAllocations.filter((row) => row.cycle_id === selectedCycle.cycle_id)
      : [];
    const fuelPlans = selectedCycle
      ? historyFuelPlans.filter((row) => row.cycle_id === selectedCycle.cycle_id)
      : [];

    const [
      itemResult,
      vendorResult,
      glResult,
      assetResult,
      budgetResult,
      planLineResult,
    ] = await Promise.all([
        supabase
          .from("app_expense_catalog_items")
          .select(
            "item_id, item_code, item_name, category, department, gl_code, expense_type, unit_measure, summary_group",
          )
          .ilike("country", country)
          .eq("is_active", true)
          .order("item_name"),

        supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name, vendor_code, notes")
          .ilike("country", country)
          .eq("is_active", true)
          .order("vendor_name"),

        supabase
          .from("app_expense_gl_codes")
          .select("gl_code_id, gl_code, description, category, summary_group")
          .ilike("country", country)
          .eq("is_active", true)
          .order("gl_code"),

        supabase
          .from("app_expense_fuel_assets")
          .select(
            "asset_id, country, nest_id, asset_type, identifier, model, purpose, fuel_type, vendor_name, consumption_rate, consumption_basis, is_active, notes",
          )
          .ilike("country", country)
          .eq("is_active", true)
          .order("identifier"),

        selectedCycle
          ? supabase
              .from("app_expense_budgets")
              .select(
                "budget_id, cycle_id, nest_id, scope_type, scope_label, department, team, gl_code, category, summary_group, budget_amount, blanket_po, quantity, unit_measure, unit_cost, notes",
              )
              .eq("cycle_id", selectedCycle.cycle_id)
          : Promise.resolve({ data: [], error: null }),

        selectedCycle
          ? supabase
              .from("app_expense_plan_lines")
              .select(
                "plan_line_id, cycle_id, nest_id, scope_type, scope_label, department, team, gl_code, category, expense_type, line_type, item_code, description, unit_measure, planned_quantity, planned_unit_cost, planned_amount, vendor_id, vendor_name_snapshot, blanket_po, notes, source_sheet, source_row, source_line_key, sort_order, copied_from_plan_line_id, created_by, updated_by, created_at, updated_at",
              )
              .eq("cycle_id", selectedCycle.cycle_id)
              .order("sort_order")
          : Promise.resolve({ data: [], error: null }),
      ]);

    for (const result of [
      itemResult,
      vendorResult,
      glResult,
      assetResult,
      budgetResult,
      planLineResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    let quotes: Record<string, unknown>[] = [];
    const entryIds = entries.map((entry) => String(entry.expense_id));

    if (entryIds.length) {
      const { data, error } = await supabase
        .from("app_expense_vendor_quotes")
        .select(
          "quote_id, expense_id, vendor_id, vendor_name_snapshot, unit_cost, total_cost, note, is_selected",
        )
        .in("expense_id", entryIds);

      if (error) throw new Error(error.message);
      quotes = (data ?? []) as Record<string, unknown>[];
    }

    let planLineQuotes: Record<string, unknown>[] = [];
    const planLineIds = (planLineResult.data ?? []).map((line) =>
      String(line.plan_line_id),
    );

    if (planLineIds.length) {
      const quoteBatchSize = 100;
      for (let offset = 0; offset < planLineIds.length; offset += quoteBatchSize) {
        const { data, error } = await supabase
          .from("app_expense_plan_line_quotes")
          .select(
            "plan_line_quote_id, plan_line_id, vendor_id, vendor_name_snapshot, unit_cost, total_cost, note, is_selected",
          )
          .in("plan_line_id", planLineIds.slice(offset, offset + quoteBatchSize));
        if (error) throw new Error(error.message);
        planLineQuotes.push(...((data ?? []) as Record<string, unknown>[]));
      }
    }

    let countryComparison: Record<string, unknown>[] = [];
    if (selectedCycle && countries.length) {
      const { data: comparisonCycles, error } = await supabase
        .from("app_expense_cycles")
        .select("cycle_id, country, currency_code, fx_rate_to_usd, fiscal_year, quarter")
        .in("country", countries)
        .eq("fiscal_year", selectedCycle.fiscal_year)
        .eq("quarter", selectedCycle.quarter);

      if (error) throw new Error(error.message);

      const comparisonIds = (comparisonCycles ?? []).map((row) => row.cycle_id);
      if (comparisonIds.length) {
        const [comparisonAllocationResult, comparisonEntryResult] =
          await Promise.all([
            supabase
              .from("app_expense_nest_allocations")
              .select("cycle_id, allocation_amount")
              .in("cycle_id", comparisonIds),
            supabase
              .from("app_expense_entries")
              .select("cycle_id, amount, actual_amount, status")
              .in("cycle_id", comparisonIds),
          ]);

        if (comparisonAllocationResult.error) {
          throw new Error(comparisonAllocationResult.error.message);
        }
        if (comparisonEntryResult.error) {
          throw new Error(comparisonEntryResult.error.message);
        }

        countryComparison = (comparisonCycles ?? []).map((row) => {
          const allocated = (comparisonAllocationResult.data ?? [])
            .filter((item) => item.cycle_id === row.cycle_id)
            .reduce((sum, item) => sum + Number(item.allocation_amount ?? 0), 0);

          const committed = (comparisonEntryResult.data ?? [])
            .filter(
              (item) =>
                item.cycle_id === row.cycle_id && item.status !== "rejected",
            )
            .reduce((sum, item) => {
              const value =
                item.status === "actual" && item.actual_amount != null
                  ? Number(item.actual_amount)
                  : Number(item.amount ?? 0);
              return sum + value;
            }, 0);

          const rate = Number(row.fx_rate_to_usd ?? 0);

          return {
            country: row.country,
            currencyCode: row.currency_code,
            allocated,
            committed,
            remaining: allocated - committed,
            allocatedUsd: rate > 0 ? allocated * rate : null,
            committedUsd: rate > 0 ? committed * rate : null,
            remainingUsd: rate > 0 ? (allocated - committed) * rate : null,
          };
        });
      }
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
        allocations,
        budgetLines: budgetResult.data ?? [],
        planLines: planLineResult.data ?? [],
        planLineQuotes,
        entries,
        historyEntries,
        historyAllocations,
        historyFuelPlans,
        fuelPlans,
        items: itemResult.data ?? [],
        vendors: vendorResult.data ?? [],
        glCodes: glResult.data ?? [],
        fuelAssets: assetResult.data ?? [],
        quotes,
        countryComparison,
        permissions: {
          canManageCountry: canManageCountry(user, country),
          canRecordNestIds: nests
            .filter((nest) => canRecordNest(user, nest.nest_id))
            .map((nest) => String(nest.nest_id)),
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

    if (!hasAccess(user)) {
      return NextResponse.json(
        { error: "You do not have access to expense planning." },
        { status: 403 },
      );
    }

    const body = normalizeRequestBody(await request.json());
    const action = String(body.action ?? "");
    const supabase = await createClient();
    const now = new Date().toISOString();

    if (["add_vendor", "add_item", "add_gl_code"].includes(action)) {
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
          .insert({
            country,
            vendor_name: vendorName,
            vendor_code: String(body.vendorCode ?? "").trim() || null,
            notes: String(body.notes ?? "").trim() || null,
            is_active: true,
          })
          .select("vendor_id, vendor_name")
          .single();

        if (error) throw new Error(error.message);
        return NextResponse.json({ vendor: data }, { status: 201 });
      }

      if (action === "add_item") {
        const itemCode = String(body.itemCode ?? "").trim();
        const itemName = String(body.itemName ?? "").trim();

        if (!itemCode || !itemName) {
          return NextResponse.json(
            { error: "Enter an item code and item name." },
            { status: 400 },
          );
        }

        const { data, error } = await supabase
          .from("app_expense_catalog_items")
          .insert({
            country,
            item_code: itemCode,
            item_name: itemName,
            category: String(body.category ?? "").trim() || null,
            department: String(body.department ?? "").trim() || null,
            gl_code: String(body.glCode ?? "").trim() || null,
            expense_type: String(body.expenseType ?? "").trim() || null,
            unit_measure: String(body.unitMeasure ?? "").trim() || null,
            summary_group: String(body.summaryGroup ?? "").trim() || null,
            is_active: true,
          })
          .select("item_id, item_code, item_name, category")
          .single();

        if (error) throw new Error(error.message);
        return NextResponse.json({ item: data }, { status: 201 });
      }

      const glCode = String(body.glCode ?? "").trim();
      const description = String(body.description ?? "").trim();

      if (!glCode || !description) {
        return NextResponse.json(
          { error: "Enter a GL code and description." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_gl_codes")
        .upsert(
          {
            country,
            gl_code: glCode,
            description,
            category: String(body.category ?? "").trim() || null,
            summary_group: String(body.summaryGroup ?? "").trim() || null,
            is_active: true,
            updated_at: now,
            created_by: user.userId,
          },
          { onConflict: "country,gl_code" },
        )
        .select("gl_code_id, gl_code, description, category, summary_group")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ glCode: data }, { status: 201 });
    }

    if (action === "create_cycle") {
      const country = String(body.country ?? "").trim();
      const fiscalYear = Number(body.fiscalYear);
      const quarter = Number(body.quarter);
      const currencyCode = currencyFor(country);
      const sourceCycleId = String(body.sourceCycleId ?? "").trim() || null;

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
        quarter > 4
      ) {
        return NextResponse.json(
          { error: "Enter a valid country, year, and quarter." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc(
        "app_create_expense_cycle_from_source",
        {
          p_country: country,
          p_fiscal_year: fiscalYear,
          p_quarter: quarter,
          p_currency_code: currencyCode,
          p_source_cycle_id: sourceCycleId,
        },
      );

      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "A quarter already exists for that country and period." },
          { status: 409 },
        );
      }
      if (error) throw new Error(error.message);

      const createdCycle = data as Record<string, any>;
      const createdCycleId = String(createdCycle.cycle_id ?? "");
      if (!createdCycleId) throw new Error("The quarter was created but its ID was not returned.");

      const allNests = await accessibleNests(supabase, user);
      const countryNests = allNests.filter(
        (nest) => nest.country?.toLowerCase() === country.toLowerCase(),
      );
      const starterCounts = {
        allocations: 0,
        plan_lines: 0,
        budget_lines: 0,
        fuel_plans: 0,
      };

      if (countryNests.length) {
        const { data: allocationRows, error: allocationError } = await supabase
          .from("app_expense_nest_allocations")
          .upsert(
            countryNests.map((nest) => ({
              cycle_id: createdCycleId,
              nest_id: nest.nest_id,
              allocation_amount: 0,
              created_by: user.userId,
              updated_by: user.userId,
              updated_at: now,
            })),
            { onConflict: "cycle_id,nest_id", ignoreDuplicates: true },
          )
          .select("allocation_id");
        if (allocationError) throw new Error(allocationError.message);
        starterCounts.allocations = allocationRows?.length ?? 0;
      }

      const { data: existingPlanLines, error: existingPlansError } = await supabase
        .from("app_expense_plan_lines")
        .select("plan_line_id")
        .eq("cycle_id", createdCycleId)
        .limit(1);
      if (existingPlansError) throw new Error(existingPlansError.message);

      if (!existingPlanLines?.length) {
        const { data: sheetTemplates, error: templateError } = await supabase
          .from("app_expense_plan_templates")
          .select("template_line_id, country, nest_key, scope_type, scope_label, department, gl_code, category, expense_type, line_type, item_code, description, unit_measure, planned_quantity, planned_unit_cost, planned_amount, vendor_id, vendor_name_snapshot, blanket_po, notes, source_sheet, source_row, source_line_key, sort_order")
          .ilike("country", country)
          .order("sort_order");
        if (templateError) throw new Error(templateError.message);

        if (sheetTemplates?.length) {
          const { data: countryVendors, error: countryVendorsError } = await supabase
            .from("app_expense_catalog_vendors")
            .select("vendor_id, vendor_name")
            .ilike("country", country)
            .eq("is_active", true);
          if (countryVendorsError) throw new Error(countryVendorsError.message);
          const vendorIds = new Map<string, string>(
            (countryVendors ?? []).map((vendor) => [vendor.vendor_name.trim().toLowerCase(), vendor.vendor_id] as const),
          );
          const nestKey = (value: unknown) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
          const nestByKey = new Map<string, NestRow>();
          for (const nest of countryNests) {
            nestByKey.set(nestKey(nest.nest_key), nest);
            nestByKey.set(nestKey(nestCode(nest)), nest);
          }

          const mappedTemplates = sheetTemplates.flatMap((template) => {
            const nest = template.scope_type === "nest"
              ? nestByKey.get(nestKey(template.nest_key))
              : null;
            if (template.scope_type === "nest" && !nest) return [];
            return [{ template, nest }];
          });
          const planRows = mappedTemplates.map(({ template, nest }) => ({
            cycle_id: createdCycleId,
            nest_id: nest?.nest_id ?? null,
            scope_type: template.scope_type,
            scope_label: template.scope_label || nest?.nest_name || country,
            department: template.department || "",
            team: null,
            gl_code: template.gl_code,
            category: template.category,
            expense_type: template.expense_type,
            line_type: template.line_type,
            item_code: template.item_code,
            description: template.description || "",
            unit_measure: template.unit_measure,
            planned_quantity: template.planned_quantity,
            planned_unit_cost: template.planned_unit_cost,
            planned_amount: template.planned_amount,
            vendor_id: template.vendor_id ?? vendorIds.get(String(template.vendor_name_snapshot ?? "").trim().toLowerCase()) ?? null,
            vendor_name_snapshot: template.vendor_name_snapshot,
            blanket_po: template.blanket_po,
            notes: template.notes,
            source_sheet: template.source_sheet,
            source_row: template.source_row,
            source_line_key: template.source_line_key,
            sort_order: template.sort_order,
            created_by: user.userId,
            updated_by: user.userId,
          }));
          const planLineByTemplateId = new Map<string, string>();
          const templateBySourceLineKey = new Map<string, (typeof mappedTemplates)[number]["template"]>(
            mappedTemplates.map(({ template }) => [String(template.source_line_key), template] as const),
          );

          for (let offset = 0; offset < planRows.length; offset += 300) {
            const { data: inserted, error: insertError } = await supabase
              .from("app_expense_plan_lines")
              .insert(planRows.slice(offset, offset + 300))
              .select("plan_line_id, source_line_key");
            if (insertError) throw new Error(insertError.message);
            starterCounts.plan_lines += inserted?.length ?? 0;
            for (const row of inserted ?? []) {
              const template = templateBySourceLineKey.get(row.source_line_key);
              if (template) planLineByTemplateId.set(template.template_line_id, row.plan_line_id);
            }
          }

          const templateIds = mappedTemplates.map(({ template }) => template.template_line_id);
          for (let offset = 0; offset < templateIds.length; offset += 400) {
            const { data: templateQuotes, error: templateQuotesError } = await supabase
              .from("app_expense_plan_template_quotes")
              .select("template_line_id, vendor_id, vendor_name_snapshot, unit_cost, total_cost, note, is_selected")
              .in("template_line_id", templateIds.slice(offset, offset + 400));
            if (templateQuotesError) throw new Error(templateQuotesError.message);
            const quoteRows = (templateQuotes ?? []).flatMap((quote) => {
              const planLineId = planLineByTemplateId.get(quote.template_line_id);
              if (!planLineId) return [];
              return [{
                plan_line_id: planLineId,
                vendor_id: quote.vendor_id ?? vendorIds.get(quote.vendor_name_snapshot.trim().toLowerCase()) ?? null,
                vendor_name_snapshot: quote.vendor_name_snapshot,
                unit_cost: quote.unit_cost,
                total_cost: quote.total_cost,
                note: quote.note,
                is_selected: quote.is_selected,
                created_by: user.userId,
              }];
            });
            for (let quoteOffset = 0; quoteOffset < quoteRows.length; quoteOffset += 300) {
              const { error: insertQuoteError } = await supabase
                .from("app_expense_plan_line_quotes")
                .insert(quoteRows.slice(quoteOffset, quoteOffset + 300));
              if (insertQuoteError) throw new Error(insertQuoteError.message);
            }
          }
        } else {
          const { data: catalogItems, error: catalogError } = await supabase
            .from("app_expense_catalog_items")
            .select("item_id, item_code, item_name, category, department, gl_code, expense_type, unit_measure")
            .ilike("country", country)
            .eq("is_active", true)
            .order("item_name");
          if (catalogError) throw new Error(catalogError.message);
          const { data: glRows, error: glError } = catalogItems?.length
            ? { data: [], error: null }
            : await supabase
                .from("app_expense_gl_codes")
                .select("gl_code, description, category")
                .ilike("country", country)
                .eq("is_active", true)
                .order("gl_code");
          if (glError) throw new Error(glError.message);
          const templates = catalogItems?.length
            ? catalogItems.map((item, index) => ({
                itemCode: item.item_code,
                description: item.item_name,
                department: item.department ?? "",
                glCode: item.gl_code,
                category: item.category,
                expenseType: item.expense_type,
                unitMeasure: item.unit_measure,
                itemId: item.item_id,
                sortOrder: index,
                source: "Expense catalog",
              }))
            : (glRows ?? []).map((item, index) => ({
                itemCode: item.gl_code,
                description: item.description,
                department: "Country Ops",
                glCode: item.gl_code,
                category: item.category,
                expenseType: null,
                unitMeasure: null,
                itemId: item.gl_code,
                sortOrder: index,
                source: "GL code catalog",
              }));
          const rows = countryNests.flatMap((nest) => templates.map((template) => ({
            cycle_id: createdCycleId,
            nest_id: nest.nest_id,
            scope_type: "nest",
            scope_label: nest.nest_name,
            department: template.department || "",
            team: null,
            gl_code: template.glCode || null,
            category: template.category || null,
            expense_type: template.expenseType,
            line_type: template.expenseType,
            item_code: template.itemCode || null,
            description: template.description || template.itemCode || "Planned expense",
            unit_measure: template.unitMeasure,
            planned_quantity: null,
            planned_unit_cost: null,
            planned_amount: null,
            vendor_id: null,
            vendor_name_snapshot: null,
            blanket_po: null,
            notes: null,
            source_sheet: template.source,
            source_line_key: `${nest.nest_id}:${template.itemId}`,
            sort_order: template.sortOrder,
            created_by: user.userId,
            updated_by: user.userId,
          })));
          for (let offset = 0; offset < rows.length; offset += 300) {
            const { data: inserted, error: insertError } = await supabase
              .from("app_expense_plan_lines")
              .insert(rows.slice(offset, offset + 300))
              .select("plan_line_id");
            if (insertError) throw new Error(insertError.message);
            starterCounts.plan_lines += inserted?.length ?? 0;
          }
        }
      }

      const { data: existingBudgets, error: budgetReadError } = await supabase
        .from("app_expense_budgets")
        .select("budget_id")
        .eq("cycle_id", createdCycleId)
        .limit(1);
      if (budgetReadError) throw new Error(budgetReadError.message);
      if (!existingBudgets?.length) {
        const { data: quarterPlanRows, error: quarterPlanError } = await supabase
          .from("app_expense_plan_lines")
          .select("nest_id, scope_type, scope_label, department, team, gl_code, category, planned_amount")
          .eq("cycle_id", createdCycleId);
        if (quarterPlanError) throw new Error(quarterPlanError.message);
        const budgetGroups = new Map<string, Record<string, any>>();
        for (const line of quarterPlanRows ?? []) {
          if (!line.gl_code) continue;
          const key = [line.scope_type, line.nest_id ?? "country", line.department ?? "", line.team ?? "", line.gl_code, line.category ?? ""].join("|");
          const existing = budgetGroups.get(key);
          if (existing) {
            existing.budget_amount += Number(line.planned_amount ?? 0);
          } else {
            budgetGroups.set(key, {
              cycle_id: createdCycleId,
              nest_id: line.nest_id,
              scope_type: line.scope_type === "nest" ? "nest" : "country",
              scope_label: line.scope_label ?? country,
              department: line.department ?? "",
              team: line.team,
              gl_code: line.gl_code,
              category: line.category ?? "Uncategorized",
              summary_group: line.category,
              budget_amount: Number(line.planned_amount ?? 0),
              created_by: user.userId,
            });
          }
        }
        let budgetRows = [...budgetGroups.values()];
        if (!budgetRows.length) {
          const { data: glCodes, error: glCodeError } = await supabase
            .from("app_expense_gl_codes")
            .select("gl_code, description, category, summary_group")
            .ilike("country", country)
            .eq("is_active", true)
            .order("gl_code");
          if (glCodeError) throw new Error(glCodeError.message);
          budgetRows = (glCodes ?? []).map((item) => ({
            cycle_id: createdCycleId,
            nest_id: null,
            scope_type: "country",
            scope_label: country,
            department: "Country Ops",
            team: null,
            gl_code: item.gl_code,
            category: item.category ?? "Uncategorized",
            summary_group: item.summary_group,
            budget_amount: 0,
            created_by: user.userId,
          }));
        }
        for (let offset = 0; offset < budgetRows.length; offset += 300) {
          const { data: inserted, error: insertError } = await supabase
            .from("app_expense_budgets")
            .insert(budgetRows.slice(offset, offset + 300))
            .select("budget_id");
          if (insertError) throw new Error(insertError.message);
          starterCounts.budget_lines += inserted?.length ?? 0;
        }
      }

      const { data: fuelAssets, error: fuelAssetsError } = await supabase
        .from("app_expense_fuel_assets")
        .select("asset_id, nest_id, asset_type, vendor_name, consumption_rate, consumption_basis")
        .ilike("country", country)
        .eq("is_active", true);
      if (fuelAssetsError) throw new Error(fuelAssetsError.message);
      if (fuelAssets?.length && countryNests.length) {
        const fuelRows = fuelAssets.map((asset) => ({
          cycle_id: createdCycleId,
          asset_id: asset.asset_id,
          nest_id: asset.nest_id ?? countryNests[0].nest_id,
          projected_monthly_activity: 0,
          consumption_rate: Number(asset.consumption_rate ?? 0),
          consumption_basis: ["per_hour", "per_100km"].includes(String(asset.consumption_basis))
            ? asset.consumption_basis
            : asset.asset_type === "generator" ? "per_hour" : "per_100km",
          cost_per_litre: 0,
          vendor_id: null,
          vendor_name_snapshot: asset.vendor_name ?? null,
          created_by: user.userId,
          updated_at: now,
        }));
        const { data: insertedFuelPlans, error: fuelPlanError } = await supabase
          .from("app_expense_fuel_plans")
          .upsert(fuelRows, {
            onConflict: "cycle_id,asset_id",
            ignoreDuplicates: true,
          })
          .select("fuel_plan_id");
        if (fuelPlanError) throw new Error(fuelPlanError.message);
        starterCounts.fuel_plans = insertedFuelPlans?.length ?? 0;
      }

      return NextResponse.json(
        {
          cycle: {
            ...createdCycle,
            seeded: {
              ...(createdCycle.seeded ?? {}),
              ...Object.fromEntries(
                Object.entries(starterCounts).map(([key, count]) => [
                  key,
                  Number((createdCycle.seeded as Record<string, unknown> | undefined)?.[key] ?? 0) + count,
                ]),
              ),
            },
          },
        },
        { status: 201 },
      );
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
    const editableActions = new Set([
      "save_fx_rate",
      "save_allocation",
      "save_allocations",
      "save_budget_line",
      "save_plan_line",
      "delete_plan_line",
      "add_expense",
      "add_fuel_asset",
      "save_fuel_plan",
      "record_fuel_actual",
    ]);

    if (editableActions.has(action) && cycle.status !== "open") {
      return NextResponse.json(
        { error: "This quarter is read-only. Open quarters can be edited." },
        { status: 409 },
      );
    }

    if (action === "set_cycle_status") {
      const nextStatus = String(body.status ?? "");
      const valid =
        (cycle.status === "draft" && nextStatus === "open") ||
        (cycle.status === "open" && nextStatus === "in_review") ||
        (cycle.status === "in_review" && nextStatus === "approved") ||
        (cycle.status === "approved" && nextStatus === "closed");

      if (!manager || !valid) {
        return NextResponse.json(
          { error: "That quarter status change is not allowed." },
          { status: 403 },
        );
      }

      const updates: Record<string, unknown> = {
        status: nextStatus,
        updated_at: now,
      };
      if (nextStatus === "in_review") {
        updates.submitted_by = user.userId;
        updates.submitted_at = now;
      }
      if (nextStatus === "approved") {
        updates.approved_by = user.userId;
        updates.approved_at = now;
        updates.approval_note = String(body.approvalNote ?? "").trim() || null;
      }

      const { error } = await supabase
        .from("app_expense_cycles")
        .update(updates)
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, status: nextStatus });
    }

    if (action === "save_fx_rate") {
      const rate = Number(body.fxRateToUsd);
      if (!manager || cycle.status !== "open" || !Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: "Enter a valid USD rate." },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("app_expense_cycles")
        .update({
          fx_rate_to_usd: rate,
          fx_rate_source: "manual",
          updated_at: now,
        })
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, fxRateToUsd: rate });
    }

    if (action === "save_allocations") {
      const values = Array.isArray(body.allocations)
        ? body.allocations as Array<Record<string, unknown>>
        : [];
      if (!manager || cycle.status !== "open" || values.length === 0) {
        return NextResponse.json(
          { error: "An open quarter and country planning access are required to save allocations." },
          { status: 403 },
        );
      }

      const rows = values.map((value) => ({
        nest_id: Number(value.nestId),
        allocation_amount: Number(value.allocatedAmount),
      }));
      if (rows.some((row) =>
        !Number.isSafeInteger(row.nest_id) ||
        row.nest_id <= 0 ||
        !Number.isFinite(row.allocation_amount) ||
        row.allocation_amount < 0
      )) {
        return NextResponse.json({ error: "Enter valid allocation amounts." }, { status: 400 });
      }

      const { data: validNests, error: nestsError } = await supabase
        .from("company_nests")
        .select("nest_id, country")
        .eq("is_production_nest", true)
        .in("nest_id", rows.map((row) => row.nest_id));
      if (nestsError) throw new Error(nestsError.message);
      const validIds = new Set(
        (validNests ?? [])
          .filter((nest) => nest.country?.toLowerCase() === cycle.country.toLowerCase())
          .map((nest) => Number(nest.nest_id)),
      );
      if (rows.some((row) => !validIds.has(row.nest_id))) {
        return NextResponse.json({ error: "Every allocation must use a production nest in this country." }, { status: 400 });
      }

      const { error } = await supabase
        .from("app_expense_nest_allocations")
        .upsert(
          rows.map((row) => ({
            cycle_id: cycleId,
            nest_id: row.nest_id,
            allocation_amount: row.allocation_amount,
            created_by: user.userId,
            updated_by: user.userId,
            updated_at: now,
          })),
          { onConflict: "cycle_id,nest_id" },
        );
      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, saved: rows.length });
    }

    if (action === "save_allocation") {
      const nestId = Number(body.nestId);
      const allocationAmount = Number(body.allocationAmount);

      if (
        !manager ||
        cycle.status !== "open" ||
        !Number.isSafeInteger(nestId) ||
        nestId <= 0 ||
        !Number.isFinite(allocationAmount) ||
        allocationAmount < 0
      ) {
        return NextResponse.json(
          { error: "Enter a valid nest allocation." },
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

    if (action === "save_plan_line") {
      const planLineId = String(body.planLineId ?? "").trim();
      const scopeType = String(body.scopeType ?? "nest");
      const nestId = body.nestId === null || body.nestId === "" || body.nestId === undefined
        ? null
        : Number(body.nestId);
      const allowedScopes = ["nest", "country", "hq", "central", "donor_program", "other"];
      const optionalAmount = (value: unknown): number | null => {
        if (value === null || value === undefined || String(value).trim() === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
      };
      const plannedQuantity = optionalAmount(body.plannedQuantity);
      const plannedUnitCost = optionalAmount(body.plannedUnitCost);
      const plannedAmount = optionalAmount(body.plannedAmount);

      if (
        !allowedScopes.includes(scopeType) ||
        (scopeType === "nest" && (!nestId || !Number.isSafeInteger(nestId))) ||
        (nestId !== null && (!Number.isSafeInteger(nestId) || nestId <= 0)) ||
        [plannedQuantity, plannedUnitCost, plannedAmount].some((value) => Number.isNaN(value))
      ) {
        return NextResponse.json(
          { error: "Enter valid plan-line scope, quantity, and costs." },
          { status: 400 },
        );
      }

      if (!manager && (nestId === null || !canRecordNest(user, nestId))) {
        return NextResponse.json(
          { error: "You can only edit plan lines for your assigned nest." },
          { status: 403 },
        );
      }
      if (scopeType !== "nest" && !manager) {
        return NextResponse.json(
          { error: "Only country planners can edit country-level plan lines." },
          { status: 403 },
        );
      }

      if (nestId !== null) {
        const { data: nest, error: nestError } = await supabase
          .from("company_nests")
          .select("nest_id, country, is_production_nest")
          .eq("nest_id", nestId)
          .maybeSingle();
        if (nestError) throw new Error(nestError.message);
        if (
          !nest ||
          !nest.is_production_nest ||
          nest.country?.toLowerCase() !== cycle.country.toLowerCase()
        ) {
          return NextResponse.json(
            { error: "Choose a production nest in this country." },
            { status: 400 },
          );
        }
      }

      let vendorNameSnapshot = String(body.vendorNameSnapshot ?? "").trim() || null;
      const vendorId = String(body.vendorId ?? "").trim() || null;
      if (vendorId) {
        const { data: vendor, error: vendorError } = await supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .eq("vendor_id", vendorId)
          .ilike("country", cycle.country)
          .eq("is_active", true)
          .maybeSingle();
        if (vendorError) throw new Error(vendorError.message);
        if (!vendor) {
          return NextResponse.json(
            { error: "Choose an active vendor from this country." },
            { status: 400 },
          );
        }
        vendorNameSnapshot = vendor.vendor_name;
      }

      const lineValues = {
        cycle_id: cycleId,
        nest_id: nestId,
        scope_type: scopeType,
        scope_label: String(body.scopeLabel ?? "").trim() || null,
        department: String(body.department ?? "").trim(),
        team: String(body.team ?? "").trim() || null,
        gl_code: String(body.glCode ?? "").trim() || null,
        category: String(body.category ?? "").trim() || null,
        expense_type: String(body.expenseType ?? "").trim() || null,
        line_type: String(body.lineType ?? "").trim() || null,
        item_code: String(body.itemCode ?? "").trim() || null,
        description: String(body.description ?? "").trim(),
        unit_measure: String(body.unitMeasure ?? "").trim() || null,
        planned_quantity: plannedQuantity,
        planned_unit_cost: plannedUnitCost,
        planned_amount: plannedAmount,
        vendor_id: vendorId,
        vendor_name_snapshot: vendorNameSnapshot,
        blanket_po: String(body.blanketPo ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
        updated_by: user.userId,
        updated_at: now,
      };

      let savedLine;
      if (planLineId) {
        const { data: existing, error: existingError } = await supabase
          .from("app_expense_plan_lines")
          .select("plan_line_id, nest_id")
          .eq("plan_line_id", planLineId)
          .eq("cycle_id", cycleId)
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (!existing) {
          return NextResponse.json({ error: "Plan line not found." }, { status: 404 });
        }
        if (!manager && (!existing.nest_id || !canRecordNest(user, Number(existing.nest_id)))) {
          return NextResponse.json({ error: "You cannot edit this plan line." }, { status: 403 });
        }
        const { data, error } = await supabase
          .from("app_expense_plan_lines")
          .update(lineValues)
          .eq("plan_line_id", planLineId)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        savedLine = data;
      } else {
        const { data, error } = await supabase
          .from("app_expense_plan_lines")
          .insert({ ...lineValues, created_by: user.userId })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        savedLine = data;
      }

      return NextResponse.json({ planLine: savedLine }, { status: planLineId ? 200 : 201 });
    }

    if (action === "delete_plan_line") {
      const planLineId = String(body.planLineId ?? "").trim();
      if (!planLineId) {
        return NextResponse.json({ error: "Select a plan line to remove." }, { status: 400 });
      }
      const { data: line, error: lineError } = await supabase
        .from("app_expense_plan_lines")
        .select("plan_line_id, nest_id")
        .eq("plan_line_id", planLineId)
        .eq("cycle_id", cycleId)
        .maybeSingle();
      if (lineError) throw new Error(lineError.message);
      if (!line) return NextResponse.json({ error: "Plan line not found." }, { status: 404 });
      if (!manager && (!line.nest_id || !canRecordNest(user, Number(line.nest_id)))) {
        return NextResponse.json({ error: "You cannot remove this plan line." }, { status: 403 });
      }
      const { error } = await supabase
        .from("app_expense_plan_lines")
        .delete()
        .eq("plan_line_id", planLineId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ planLineId, deleted: true });
    }

    if (action === "save_budget_line") {
      if (!manager || cycle.status !== "open") {
        return NextResponse.json(
          { error: "Only country planners can edit this quarter’s budget." },
          { status: 403 },
        );
      }

      const nestId = body.nestId ? Number(body.nestId) : null;
      const budgetAmount = Number(body.budgetAmount);
      const glCode = String(body.glCode ?? "").trim();
      const category = String(body.category ?? "").trim();
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
        !glCode ||
        !category ||
        !allowedScopes.includes(scopeType)
      ) {
        return NextResponse.json(
          { error: "Enter valid budget line details." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_budgets")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          scope_type: scopeType,
          scope_label: String(body.scopeLabel ?? "").trim() || null,
          department: String(body.department ?? "").trim(),
          team: String(body.team ?? "").trim() || null,
          gl_code: glCode,
          category,
          summary_group: String(body.summaryGroup ?? "").trim() || null,
          budget_amount: budgetAmount,
          blanket_po: String(body.blanketPo ?? "").trim() || null,
          unit_measure: String(body.unitMeasure ?? "").trim() || null,
          quantity: body.quantity ? Number(body.quantity) : null,
          unit_cost: body.unitCost ? Number(body.unitCost) : null,
          notes: String(body.notes ?? "").trim() || null,
          created_by: user.userId,
        })
        .select(
          "budget_id, cycle_id, nest_id, scope_type, scope_label, department, team, gl_code, category, summary_group, budget_amount, blanket_po, quantity, unit_measure, unit_cost, notes",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ budgetLine: data }, { status: 201 });
    }

    if (action === "add_expense") {
      const nestId = Number(body.nestId);
      const itemId = String(body.itemId ?? "");
      const vendorId = String(body.vendorId ?? "");
      const quantity = Number(body.quantity);
      const unitCost = Number(body.unitCost);
      const amount = Number(body.amount);
      const status = String(body.status ?? "planned");

      if (
        cycle.status !== "open" ||
        !canRecordNest(user, nestId) ||
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
          { error: "Complete the expense fields and confirm the quarter is open." },
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
          { error: "The selected nest is not in this quarter’s country." },
          { status: 400 },
        );
      }

      const [itemResult, vendorResult, allocationResult] = await Promise.all([
        supabase
          .from("app_expense_catalog_items")
          .select(
            "item_id, item_code, item_name, category, department, gl_code, expense_type, unit_measure, summary_group",
          )
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

      if (!itemResult.data || !vendorResult.data || !allocationResult.data) {
        return NextResponse.json(
          { error: "The item, vendor, and nest allocation must be valid for this country." },
          { status: 400 },
        );
      }

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
          actual_amount: status === "actual" ? amount : null,
          status,
          department:
            String(body.department ?? "").trim() ||
            itemResult.data.department ||
            null,
          team: String(body.team ?? "").trim() || null,
          gl_code:
            String(body.glCode ?? "").trim() || itemResult.data.gl_code || null,
          category:
            String(body.category ?? "").trim() ||
            itemResult.data.category ||
            null,
          expense_type:
            String(body.expenseType ?? "").trim() ||
            itemResult.data.expense_type ||
            "other",
          summary_group:
            String(body.summaryGroup ?? "").trim() ||
            itemResult.data.summary_group ||
            null,
          description: String(body.description ?? "").trim(),
          unit_measure:
            String(body.unitMeasure ?? "").trim() ||
            itemResult.data.unit_measure ||
            null,
          quantity,
          unit_cost: unitCost,
          blanket_po: String(body.blanketPo ?? "").trim() || null,
          comment: String(body.comment ?? "").trim(),
          created_by: user.userId,
        })
        .select(
          "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, actual_amount, status, department, team, gl_code, category, expense_type, summary_group, description, unit_measure, quantity, unit_cost, blanket_po, comment, created_by, created_at",
        )
        .single();

      if (error) throw new Error(error.message);

      const quoteInputs = Array.isArray(body.quotes)
        ? (body.quotes as Array<Record<string, unknown>>)
        : [];
      const quoteIds = [
        vendorId,
        ...quoteInputs.map((quote) => String(quote.vendorId ?? "")),
      ].filter(Boolean);

      if (quoteIds.length) {
        const { data: quoteVendors, error: quoteVendorError } = await supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .in("vendor_id", quoteIds)
          .ilike("country", cycle.country)
          .eq("is_active", true);

        if (quoteVendorError) throw new Error(quoteVendorError.message);

        const vendorNames = new Map(
          (quoteVendors ?? []).map((row) => [row.vendor_id, row.vendor_name]),
        );

        const quoteRows = [
          {
            vendorId,
            unitCost,
            totalCost: amount,
            note: "Selected vendor",
            selected: true,
          },
          ...quoteInputs.map((quote) => ({
            vendorId: String(quote.vendorId ?? ""),
            unitCost: Number(quote.unitCost),
            totalCost: Number(quote.totalCost),
            note: String(quote.note ?? ""),
            selected: false,
          })),
        ]
          .filter(
            (quote) =>
              vendorNames.has(quote.vendorId) &&
              Number.isFinite(quote.unitCost) &&
              quote.unitCost >= 0 &&
              Number.isFinite(quote.totalCost) &&
              quote.totalCost >= 0,
          )
          .map((quote) => ({
            expense_id: expense.expense_id,
            vendor_id: quote.vendorId,
            vendor_name_snapshot: vendorNames.get(quote.vendorId),
            unit_cost: quote.unitCost,
            total_cost: quote.totalCost,
            note: quote.note || null,
            is_selected: quote.selected,
            created_by: user.userId,
            updated_at: now,
          }));

        if (quoteRows.length) {
          const { error: quoteError } = await supabase
            .from("app_expense_vendor_quotes")
            .upsert(quoteRows, {
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
        cycle.status !== "in_review" ||
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
          { error: "Expense line not found." },
          { status: 404 },
        );
      }
      if (current.created_by === user.userId) {
        return NextResponse.json(
          { error: "You cannot review a line you created." },
          { status: 403 },
        );
      }

      const actualAmount =
        status === "actual"
          ? Number(body.actualAmount ?? current.amount)
          : null;

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
      const assetType = String(body.assetType ?? "");
      const identifier = String(body.identifier ?? "").trim();
      const requestedNestId = body.nestId ? Number(body.nestId) : null;

      if (
        !manager ||
        cycle.status !== "open" ||
        !["vehicle", "generator", "fuel_card", "other"].includes(assetType) ||
        !identifier
      ) {
        return NextResponse.json(
          { error: "Enter a valid asset identifier and type." },
          { status: 400 },
        );
      }

      if (requestedNestId !== null) {
        if (!Number.isSafeInteger(requestedNestId) || requestedNestId <= 0) {
          return NextResponse.json({ error: "Choose a valid production nest." }, { status: 400 });
        }
        const { data: assetNest, error: assetNestError } = await supabase
          .from("company_nests")
          .select("nest_id, country, is_production_nest")
          .eq("nest_id", requestedNestId)
          .maybeSingle();
        if (assetNestError) throw new Error(assetNestError.message);
        if (!assetNest || !assetNest.is_production_nest || assetNest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
          return NextResponse.json({ error: "Choose a production nest in this country." }, { status: 400 });
        }
      }

      const { data, error } = await supabase
        .from("app_expense_fuel_assets")
        .insert({
          country: cycle.country,
          nest_id: requestedNestId,
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

      if (error) throw new Error(error.message);
      return NextResponse.json({ asset: data }, { status: 201 });
    }

    if (action === "save_fuel_plan") {
      const assetId = String(body.assetId ?? "");
      const requestedNestId = Number(body.nestId);
      const nestId = Number.isSafeInteger(requestedNestId) && requestedNestId > 0
        ? requestedNestId
        : 0;
      const monthly = Number(body.projectedMonthlyActivity);
      const consumption = Number(body.consumptionRate);
      const basis = String(body.consumptionBasis ?? "");
      const costPerLitre = Number(body.costPerLitre);

      if (
        cycle.status !== "open" ||
        (!manager && !canRecordNest(user, nestId)) ||
        !assetId ||
        !nestId ||
        !Number.isFinite(monthly) ||
        monthly < 0 ||
        !Number.isFinite(consumption) ||
        consumption < 0 ||
        !Number.isFinite(costPerLitre) ||
        costPerLitre < 0 ||
        !["per_100km", "per_hour"].includes(basis)
      ) {
        return NextResponse.json(
          { error: "Enter valid fuel planning details." },
          { status: 400 },
        );
      }

      const { data: asset, error: assetError } = await supabase
        .from("app_expense_fuel_assets")
        .select("asset_id, country, nest_id, asset_type")
        .eq("asset_id", assetId)
        .eq("is_active", true)
        .maybeSingle();

      if (assetError) throw new Error(assetError.message);
      if (
        !asset ||
        asset.country.toLowerCase() !== cycle.country.toLowerCase() ||
        (asset.nest_id !== null && Number(asset.nest_id) !== nestId)
      ) {
        return NextResponse.json(
          { error: "Choose an active asset from this country." },
          { status: 400 },
        );
      }

      const { data: nest, error: nestError } = await supabase
        .from("company_nests")
        .select("nest_id, country, is_production_nest")
        .eq("nest_id", nestId)
        .maybeSingle();
      if (nestError) throw new Error(nestError.message);
      if (!nest || !nest.is_production_nest || nest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json({ error: "Choose a production nest in this country." }, { status: 400 });
      }

      const vendorId = String(body.vendorId ?? "").trim() || null;
      let vendorNameSnapshot = String(body.vendorNameSnapshot ?? "").trim() || null;
      if (!vendorId) {
        return NextResponse.json({ error: "Select a fuel vendor from this country." }, { status: 400 });
      }
      if (vendorId) {
        const { data: vendor, error: vendorError } = await supabase
          .from("app_expense_catalog_vendors")
          .select("vendor_id, vendor_name")
          .eq("vendor_id", vendorId)
          .ilike("country", cycle.country)
          .eq("is_active", true)
          .maybeSingle();
        if (vendorError) throw new Error(vendorError.message);
        if (!vendor) {
          return NextResponse.json({ error: "Choose a vendor from this country." }, { status: 400 });
        }
        vendorNameSnapshot = vendor.vendor_name;
      }

      const { data, error } = await supabase
        .from("app_expense_fuel_plans")
        .upsert(
          {
            cycle_id: cycleId,
            asset_id: assetId,
            nest_id: nestId,
            projected_monthly_activity: monthly,
            consumption_rate: consumption,
            consumption_basis: basis,
            cost_per_litre: costPerLitre,
            vendor_id: vendorId,
            vendor_name_snapshot: vendorNameSnapshot,
            notes: String(body.notes ?? "").trim() || null,
            created_by: user.userId,
            updated_at: now,
          },
          { onConflict: "cycle_id,asset_id" },
        )
        .select(
          "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, vendor_id, vendor_name_snapshot, actual_monthly_activity, actual_quarterly_litres, actual_quarterly_cost, actual_notes",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ fuelPlan: data });
    }

    if (action === "record_fuel_actual") {
      const planId = String(body.fuelPlanId ?? "");
      const actualMonthly = Number(body.actualMonthlyActivity);
      const actualLitres = Number(body.actualQuarterlyLitres);
      const actualCost = Number(body.actualQuarterlyCost);

      if (
        !manager ||
        cycle.status !== "open" ||
        !planId ||
        !Number.isFinite(actualMonthly) ||
        actualMonthly < 0 ||
        !Number.isFinite(actualLitres) ||
        actualLitres < 0 ||
        !Number.isFinite(actualCost) ||
        actualCost < 0
      ) {
        return NextResponse.json(
          { error: "Enter valid actual fuel results." },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("app_expense_fuel_plans")
        .update({
          actual_monthly_activity: actualMonthly,
          actual_quarterly_litres: actualLitres,
          actual_quarterly_cost: actualCost,
          actual_notes: String(body.actualNotes ?? "").trim() || null,
          actual_recorded_by: user.userId,
          actual_recorded_at: now,
        })
        .eq("fuel_plan_id", planId)
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ fuelPlanId: planId, actualRecorded: true });
    }

    return NextResponse.json(
      { error: "Unsupported expense action." },
      { status: 400 },
    );
  } catch (error) {
    return fail(error, "Unable to save quarterly expense data.");
  }
}
