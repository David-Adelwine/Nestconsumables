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

function canUseExpenses(user: AppUser): boolean {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "business_ops_manager") ||
    hasRole(user, "procurement") ||
    hasRole(user, "finance") ||
    hasRole(user, "quartermaster") ||
    hasRole(user, "nest_lead")
  );
}

function canManageCountry(user: AppUser, country: string): boolean {
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

function canRecordExpenses(user: AppUser): boolean {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "quartermaster") ||
    hasRole(user, "nest_lead")
  );
}

function currencyFor(country: string): string | null {
  const value = country.trim().toUpperCase();

  if (value === "GH" || value.includes("GHANA")) return "GHS";
  if (value === "RW" || value.includes("RWANDA")) return "RWF";
  if (value === "NG" || value.includes("NIGERIA")) return "NGN";
  if (value === "CI" || value.includes("COTE") || value.includes("IVORY")) {
    return "XOF";
  }
  if (value === "KE" || value.includes("KENYA")) return "KES";
  if (value === "US" || value.includes("UNITED STATES")) return "USD";
  if (value === "JP" || value.includes("JAPAN")) return "JPY";
  if (value === "UA" || value.includes("UKRAINE")) return "UAH";

  return null;
}

function nestCode(nest: NestRow): string {
  const match = nest.nest_key?.trim().match(/^([a-z]+)[- _]?(\d+)$/i);
  return match ? `${match[1]}-${match[2]}`.toUpperCase() : `NEST-${nest.nest_id}`;
}

function unauthorized() {
  return NextResponse.json(
    { error: "Please sign in with an active application account." },
    { status: 401 },
  );
}

function failure(error: unknown, fallback: string) {
  console.error(fallback, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

async function getAccessibleNests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
): Promise<NestRow[]> {
  const found = new Map<number, NestRow>();

  const add = (rows: unknown[] | null) => {
    for (const raw of rows ?? []) {
      const nest = raw as NestRow;
      found.set(Number(nest.nest_id), {
        ...nest,
        nest_id: Number(nest.nest_id),
      });
    }
  };

  const query = () =>
    supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

  if (hasRole(user, "it_admin")) {
    const { data, error } = await query();
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
    return [...found.values()];
  }

  const countryCodes = [
    ...new Set(user.countryAccess.map((value) => value.trim()).filter(Boolean)),
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
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];

  if (nestIds.length) {
    const { data, error } = await query().in("nest_id", nestIds);
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
  }

  const regionIds = [...new Set(user.regionAccess.filter(Boolean))];

  if (regionIds.length) {
    const { data, error } = await supabase
      .from("app_nest_regions")
      .select("nest_id")
      .in("region_id", regionIds);

    if (error) throw new Error(error.message);

    const ids = [
      ...new Set(
        (data ?? [])
          .map((row) => Number(row.nest_id))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];

    if (ids.length) {
      const { data: regionNests, error: regionError } = await query().in(
        "nest_id",
        ids,
      );

      if (regionError) throw new Error(regionError.message);
      add(regionNests as unknown[] | null);
    }
  }

  return [...found.values()];
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();
    if (!user?.isActive || !user.hasApplicationAccess) return unauthorized();

    if (!canUseExpenses(user)) {
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
          .filter((country): country is string => Boolean(country)),
      ),
    ].sort();

    const params = new URL(request.url).searchParams;
    const country = params.get("country") ?? countries[0];

    if (
      !country ||
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

    const { data: cycles, error: cycleError } = await supabase
      .from("app_expense_cycles")
      .select(
        "cycle_id, country, fiscal_year, quarter, currency_code, status, owner_user_id, source_cycle_id, created_at, updated_at",
      )
      .ilike("country", country)
      .order("fiscal_year", { ascending: false })
      .order("quarter", { ascending: false });

    if (cycleError) throw new Error(cycleError.message);

    const requestedCycleId = params.get("cycleId");
    const selectedCycle =
      (cycles ?? []).find((cycle) => cycle.cycle_id === requestedCycleId) ??
      (cycles ?? [])[0] ??
      null;

    let allocations: unknown[] = [];
    let entries: unknown[] = [];

    if (selectedCycle) {
      const [allocationResult, entryResult] = await Promise.all([
        supabase
          .from("app_expense_nest_allocations")
          .select(
            "allocation_id, cycle_id, nest_id, allocation_amount, notes, updated_at",
          )
          .eq("cycle_id", selectedCycle.cycle_id),

        supabase
          .from("app_expense_entries")
          .select(
            "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, comment, created_by, created_at",
          )
          .eq("cycle_id", selectedCycle.cycle_id)
          .order("created_at", { ascending: false }),
      ]);

      if (allocationResult.error) throw new Error(allocationResult.error.message);
      if (entryResult.error) throw new Error(entryResult.error.message);

      allocations = allocationResult.data ?? [];
      entries = entryResult.data ?? [];
    }

    const [itemResult, vendorResult] = await Promise.all([
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
    ]);

    if (itemResult.error) throw new Error(itemResult.error.message);
    if (vendorResult.error) throw new Error(vendorResult.error.message);

    const manageable = canManageCountry(user, country);
    const recordNestIds = canRecordExpenses(user)
      ? nests.map((nest) => String(nest.nest_id))
      : [];

    return NextResponse.json(
      {
        countries,
        country,
        currencyCode: selectedCycle?.currency_code ?? currencyFor(country) ?? "USD",
        nests: nests.map((nest) => ({
          id: String(nest.nest_id),
          code: nestCode(nest),
          name: nest.nest_name,
        })),
        cycles: cycles ?? [],
        selectedCycle,
        allocations,
        entries,
        items: itemResult.data ?? [],
        vendors: vendorResult.data ?? [],
        permissions: {
          canManageCountry: manageable,
          canRecordNestIds: recordNestIds,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "Unable to load quarterly expense data.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserContext();
    if (!user?.isActive || !user.hasApplicationAccess) return unauthorized();

    if (!canUseExpenses(user)) {
      return NextResponse.json(
        { error: "You do not have access to quarterly expenses." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = await createClient();

    if (action === "create_cycle") {
      const country = String(body.country ?? "").trim();
      const year = Number(body.fiscalYear);
      const quarter = Number(body.quarter);
      const currencyCode = currencyFor(country);

      if (!canManageCountry(user, country)) {
        return NextResponse.json({ error: "You cannot manage this country." }, { status: 403 });
      }

      if (
        !currencyCode ||
        !Number.isInteger(year) ||
        year < 2020 ||
        year > 2100 ||
        !Number.isInteger(quarter) ||
        quarter < 1 ||
        quarter > 4
      ) {
        return NextResponse.json(
          { error: "Enter a valid country, fiscal year, and quarter." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("app_expense_cycles")
        .insert({
          country,
          fiscal_year: year,
          quarter,
          currency_code: currencyCode,
          status: "draft",
          owner_user_id: user.userId,
          created_by: user.userId,
        })
        .select(
          "cycle_id, country, fiscal_year, quarter, currency_code, status, owner_user_id, source_cycle_id, created_at, updated_at",
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
      return NextResponse.json({ error: "Select a quarter." }, { status: 400 });
    }

    const { data: cycle, error: cycleError } = await supabase
      .from("app_expense_cycles")
      .select("cycle_id, country, status, currency_code")
      .eq("cycle_id", cycleId)
      .maybeSingle();

    if (cycleError) throw new Error(cycleError.message);
    if (!cycle) {
      return NextResponse.json({ error: "Quarter not found." }, { status: 404 });
    }

    if (!canManageCountry(user, cycle.country) && action !== "add_expense") {
      return NextResponse.json({ error: "You cannot manage this country." }, { status: 403 });
    }

    if (action === "set_cycle_status") {
      const status = String(body.status ?? "");
      const allowed =
        (cycle.status === "draft" && status === "open") ||
        (cycle.status === "open" && status === "closed");

      if (!canManageCountry(user, cycle.country) || !allowed) {
        return NextResponse.json({ error: "That quarter status change is not allowed." }, { status: 403 });
      }

      const { error } = await supabase
        .from("app_expense_cycles")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("cycle_id", cycleId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, status });
    }

    if (action === "save_allocation") {
      if (cycle.status === "closed") {
        return NextResponse.json(
          { error: "Allocations cannot be changed after the quarter is closed." },
          { status: 409 },
        );
      }

      const nestId = Number(body.nestId);
      const amount = Number(body.allocationAmount);

      if (!Number.isSafeInteger(nestId) || nestId <= 0 || !Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "Enter a valid nest and allocation amount." }, { status: 400 });
      }

      const { data: nest, error: nestError } = await supabase
        .from("company_nests")
        .select("nest_id, country")
        .eq("nest_id", nestId)
        .eq("is_production_nest", true)
        .maybeSingle();

      if (nestError) throw new Error(nestError.message);
      if (!nest || nest.country?.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json({ error: "Choose a production nest in this country." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("app_expense_nest_allocations")
        .upsert(
          {
            cycle_id: cycleId,
            nest_id: nestId,
            allocation_amount: amount,
            notes: String(body.notes ?? "").trim() || null,
            created_by: user.userId,
            updated_by: user.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cycle_id,nest_id" },
        )
        .select("allocation_id, cycle_id, nest_id, allocation_amount, notes, updated_at")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ allocation: data });
    }

    if (action === "add_expense") {
      if (cycle.status !== "open") {
        return NextResponse.json({ error: "This quarter is not open for expenses." }, { status: 409 });
      }

      const nestId = Number(body.nestId);
      const itemId = String(body.itemId ?? "");
      const vendorId = String(body.vendorId ?? "");
      const amount = Number(body.amount);
      const comment = String(body.comment ?? "").trim();

      if (
        !Number.isSafeInteger(nestId) ||
        nestId <= 0 ||
        !itemId ||
        !vendorId ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return NextResponse.json(
          { error: "Choose a nest, expense item, vendor, and valid amount." },
          { status: 400 },
        );
      }

      if (
        !canRecordExpenses(user) ||
        !user.nestAccess.some((access) => Number(access.nestId) === nestId)
      ) {
        return NextResponse.json(
          { error: "You can only record expenses for a nest assigned to you." },
          { status: 403 },
        );
      }

      const { data: nests, error: nestsError } = await supabase
        .from("company_nests")
        .select("nest_id, country")
        .eq("nest_id", nestId)
        .eq("is_production_nest", true)
        .maybeSingle();

      if (nestsError) throw new Error(nestsError.message);
      if (!nests || nests.country?.toLowerCase() !== cycle.country.toLowerCase()) {
        return NextResponse.json({ error: "The nest must belong to this quarter country." }, { status: 400 });
      }

      const [itemResult, vendorResult, allocationResult] = await Promise.all([
        supabase
          .from("app_expense_catalog_items")
          .select("item_id, item_code, item_name")
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
      if (!itemResult.data || !vendorResult.data) {
        return NextResponse.json({ error: "Choose an active item and vendor for this country." }, { status: 400 });
      }
      if (!allocationResult.data) {
        return NextResponse.json({ error: "This nest has no allocation for this quarter." }, { status: 409 });
      }

      const { data, error } = await supabase
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
          comment,
          created_by: user.userId,
        })
        .select(
          "expense_id, cycle_id, nest_id, item_code_snapshot, item_name_snapshot, vendor_name_snapshot, amount, comment, created_by, created_at",
        )
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ expense: data }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported expense action." }, { status: 400 });
  } catch (error) {
    return failure(error, "Unable to save quarterly expense data.");
  }
}