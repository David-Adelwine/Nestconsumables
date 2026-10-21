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
    const requestedCycleId = params.get("cycleId");
    const selectedCycle =
      cycles.find((cycle) => cycle.cycle_id === requestedCycleId) ??
      cycles[0] ??
      null;
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
            "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, actual_monthly_activity, actual_quarterly_litres, actual_quarterly_cost, actual_notes",
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

    const [itemResult, vendorResult, glResult, assetResult, budgetResult] =
      await Promise.all([
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
      ]);

    for (const result of [
      itemResult,
      vendorResult,
      glResult,
      assetResult,
      budgetResult,
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

    const body = (await request.json()) as Record<string, unknown>;
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
      const rate = body.fxRateToUsd ? Number(body.fxRateToUsd) : null;
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
        (rate !== null && (!Number.isFinite(rate) || rate <= 0))
      ) {
        return NextResponse.json(
          { error: "Enter a valid country, year, quarter, and FX rate." },
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
          fx_rate_to_usd: rate,
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
      if (!manager || !Number.isFinite(rate) || rate <= 0) {
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

    if (action === "save_allocation") {
      const nestId = Number(body.nestId);
      const allocationAmount = Number(body.allocationAmount);

      if (
        !manager ||
        cycle.status === "closed" ||
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

    if (action === "save_budget_line") {
      if (!manager || cycle.status === "closed") {
        return NextResponse.json(
          { error: "Only country planners can edit this quarter’s budget." },
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

      const { data, error } = await supabase
        .from("app_expense_budgets")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          scope_type: scopeType,
          scope_label: String(body.scopeLabel ?? "").trim() || null,
          department: String(body.department ?? "").trim() || null,
          team: String(body.team ?? "").trim() || null,
          gl_code: String(body.glCode ?? "").trim() || null,
          category: String(body.category ?? "").trim() || null,
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
      const nestId = Number(body.nestId);
      const assetType = String(body.assetType ?? "");
      const identifier = String(body.identifier ?? "").trim();

      if (
        !manager ||
        !["vehicle", "generator", "fuel_card", "other"].includes(assetType) ||
        !identifier
      ) {
        return NextResponse.json(
          { error: "Enter a valid asset identifier and type." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_fuel_assets")
        .insert({
          country: cycle.country,
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

      if (error) throw new Error(error.message);
      return NextResponse.json({ asset: data }, { status: 201 });
    }

    if (action === "save_fuel_plan") {
      const assetId = String(body.assetId ?? "");
      const nestId = Number(body.nestId);
      const monthly = Number(body.projectedMonthlyActivity);
      const consumption = Number(body.consumptionRate);
      const basis = String(body.consumptionBasis ?? "");
      const costPerLitre = Number(body.costPerLitre);

      if (
        cycle.status === "closed" ||
        (!manager && !canRecordNest(user, nestId)) ||
        !assetId ||
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
        .select("asset_id, country, nest_id")
        .eq("asset_id", assetId)
        .eq("is_active", true)
        .maybeSingle();

      if (assetError) throw new Error(assetError.message);
      if (!asset || asset.country.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json(
          { error: "Choose an active asset from this country." },
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
            projected_monthly_activity: monthly,
            consumption_rate: consumption,
            consumption_basis: basis,
            cost_per_litre: costPerLitre,
            notes: String(body.notes ?? "").trim() || null,
            created_by: user.userId,
            updated_at: now,
          },
          { onConflict: "cycle_id,asset_id" },
        )
        .select(
          "fuel_plan_id, cycle_id, asset_id, nest_id, projected_monthly_activity, consumption_rate, consumption_basis, cost_per_litre, estimated_quarterly_litres, estimated_quarterly_cost, actual_monthly_activity, actual_quarterly_litres, actual_quarterly_cost, actual_notes",
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