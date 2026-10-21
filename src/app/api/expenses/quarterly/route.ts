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

const financialRoles = [
  "it_admin",
  "business_ops_manager",
  "procurement",
  "finance",
] as const;

function canUseExpensePlanning(user: AppUser): boolean {
  return financialRoles.some((role) => hasRole(user, role));
}

function canReviewExpenses(user: AppUser): boolean {
  return (
    hasRole(user, "it_admin") ||
    hasRole(user, "business_ops_manager") ||
    hasRole(user, "procurement") ||
    hasRole(user, "finance")
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
    value.includes("CÔTE") ||
    value.includes("IVORY")
  ) return "XOF";
  if (value === "KE" || value.includes("KENYA")) return "KES";
  return null;
}

function formatNestCode(nest: NestRow): string {
  const match = nest.nest_key?.trim().match(/^([a-z]+)[- _]?(\d+)$/i);
  return match
    ? `${match[1]}-${match[2]}`.toUpperCase()
    : `NEST-${nest.nest_id}`;
}

function numberFrom(value: unknown, label: string, allowEmpty = false): number | null {
  if ((value === null || value === undefined || value === "") && allowEmpty) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return parsed;
}

async function getAccessibleNests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: AppUser,
): Promise<NestRow[]> {
  const found = new Map<number, NestRow>();
  const add = (data: unknown[] | null) => {
    for (const raw of data ?? []) {
      const row = raw as NestRow;
      found.set(Number(row.nest_id), { ...row, nest_id: Number(row.nest_id) });
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

  const countryCodes = [...new Set(user.countryAccess.map((value) => value.trim()).filter(Boolean))];
  if (countryCodes.length) {
    const { data, error } = await query().in("country", countryCodes);
    if (error) throw new Error(error.message);
    add(data as unknown[] | null);
  }

  const directIds = [...new Set(user.nestAccess.map((item) => Number(item.nestId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (directIds.length) {
    const { data, error } = await query().in("nest_id", directIds);
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

    const ids = [...new Set((data ?? []).map((row) => Number(row.nest_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (ids.length) {
      const { data: regionNests, error: regionError } = await query().in("nest_id", ids);
      if (regionError) throw new Error(regionError.message);
      add(regionNests as unknown[] | null);
    }
  }

  return [...found.values()];
}

function unauthorized() {
  return NextResponse.json({ error: "Please sign in with an active application account." }, { status: 401 });
}

function failure(error: unknown, fallback: string) {
  console.error(fallback, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const user = await getUserContext();
    if (!user?.isActive || !user.hasApplicationAccess) return unauthorized();
    if (!canUseExpensePlanning(user)) {
      return NextResponse.json({ error: "You do not have access to quarterly expense planning." }, { status: 403 });
    }

    const supabase = await createClient();
    const nests = await getAccessibleNests(supabase, user);
    const countries = [...new Set(nests.map((nest) => nest.country).filter((country): country is string => Boolean(country)))].sort();
    const search = new URL(request.url).searchParams;
    const requestedCountry = search.get("country");
    const country = requestedCountry ?? countries[0];

    if (!country || !countries.some((value) => value.toLowerCase() === country.toLowerCase())) {
      return NextResponse.json({ error: "You do not have access to this country." }, { status: 403 });
    }

    const countryNests = nests
      .filter((nest) => nest.country?.toLowerCase() === country.toLowerCase())
      .sort((a, b) => a.nest_name.localeCompare(b.nest_name));
    const currencyCode = currencyFor(country);
    if (!currencyCode) {
      return NextResponse.json({ error: `No currency mapping is configured for ${country}.` }, { status: 400 });
    }

    const { data: cycles, error: cyclesError } = await supabase
      .from("app_expense_cycles")
      .select("cycle_id, country, fiscal_year, quarter, currency_code, status, owner_user_id, source_cycle_id, created_at, updated_at")
      .ilike("country", country)
      .order("fiscal_year", { ascending: false })
      .order("quarter", { ascending: false });

    if (cyclesError) throw new Error(cyclesError.message);

    const cycleId = search.get("cycleId") ?? cycles?.[0]?.cycle_id ?? null;
    const selectedCycle = (cycles ?? []).find((cycle) => cycle.cycle_id === cycleId) ?? null;

    let budgets: unknown[] = [];
    let requests: unknown[] = [];
    if (selectedCycle) {
      const [budgetResult, requestResult] = await Promise.all([
        supabase
          .from("app_expense_budgets")
          .select("budget_id, cycle_id, nest_id, department, gl_code, category, budget_amount, notes, created_at")
          .eq("cycle_id", selectedCycle.cycle_id)
          .order("category", { ascending: true }),
        supabase
          .from("app_expense_requests")
          .select("expense_id, cycle_id, nest_id, department, gl_code, category, expense_type, description, unit_measure, quantity, requested_amount, approved_amount, vendor_name, status, requester_note, review_note, created_by, created_at, updated_at")
          .eq("cycle_id", selectedCycle.cycle_id)
          .order("created_at", { ascending: false }),
      ]);
      if (budgetResult.error) throw new Error(budgetResult.error.message);
      if (requestResult.error) throw new Error(requestResult.error.message);
      budgets = budgetResult.data ?? [];
      requests = requestResult.data ?? [];
    }

    return NextResponse.json(
      {
        countries,
        country,
        currencyCode,
        nests: countryNests.map((nest) => ({
          id: String(nest.nest_id),
          code: formatNestCode(nest),
          name: nest.nest_name,
        })),
        cycles: cycles ?? [],
        selectedCycle,
        budgets,
        requests,
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
    if (!canUseExpensePlanning(user)) {
      return NextResponse.json({ error: "You do not have access to quarterly expense planning." }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = await createClient();

    if (action === "create_cycle") {
      const country = String(body.country ?? "").trim();
      const fiscalYear = Number(body.fiscalYear);
      const quarter = Number(body.quarter);
      const currencyCode = currencyFor(country);

      if (!country || !currencyCode || !Number.isInteger(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2100) {
        return NextResponse.json({ error: "Choose a valid country and fiscal year." }, { status: 400 });
      }
      if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        return NextResponse.json({ error: "Choose a quarter from Q1 to Q4." }, { status: 400 });
      }
      const allowedNests = await getAccessibleNests(supabase, user);
      if (!hasRole(user, "it_admin") && !allowedNests.some((nest) => nest.country?.toLowerCase() === country.toLowerCase())) {
        return NextResponse.json({ error: "You do not have access to this country." }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("app_expense_cycles")
        .insert({
          country,
          fiscal_year: fiscalYear,
          quarter,
          currency_code: currencyCode,
          status: "draft",
          owner_user_id: user.userId,
          source_cycle_id: body.sourceCycleId ? String(body.sourceCycleId) : null,
          created_by: user.userId,
        })
        .select("cycle_id, country, fiscal_year, quarter, currency_code, status, owner_user_id, source_cycle_id, created_at, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "A cycle already exists for that country and quarter." }, { status: 409 });
        }
        throw new Error(error.message);
      }
      return NextResponse.json({ cycle: data }, { status: 201 });
    }

    const cycleId = String(body.cycleId ?? "");
    if (!cycleId) return NextResponse.json({ error: "Choose a quarterly cycle." }, { status: 400 });

    const { data: cycle, error: cycleError } = await supabase
      .from("app_expense_cycles")
      .select("cycle_id, country, status, currency_code, owner_user_id")
      .eq("cycle_id", cycleId)
      .maybeSingle();
    if (cycleError) throw new Error(cycleError.message);
    if (!cycle) return NextResponse.json({ error: "Quarterly cycle not found." }, { status: 404 });

    const nests = await getAccessibleNests(supabase, user);
    if (!hasRole(user, "it_admin") && !nests.some((nest) => nest.country?.toLowerCase() === cycle.country.toLowerCase())) {
      return NextResponse.json({ error: "You do not have access to this country." }, { status: 403 });
    }

    if (action === "set_cycle_status") {
      const nextStatus = String(body.status ?? "");
      const allowedTransitions: Record<string, string[]> = {
        draft: ["open"],
        open: ["in_review"],
        in_review: ["open", "approved"],
        approved: ["closed"],
        closed: [],
      };
      if (!allowedTransitions[cycle.status]?.includes(nextStatus)) {
        return NextResponse.json({ error: "That cycle status change is not allowed." }, { status: 400 });
      }
      const { error } = await supabase
        .from("app_expense_cycles")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("cycle_id", cycleId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ cycleId, status: nextStatus });
    }

    if (action === "add_budget") {
      if (cycle.status === "approved" || cycle.status === "closed") {
        return NextResponse.json({ error: "Budgets cannot be changed after approval." }, { status: 409 });
      }
      const category = String(body.category ?? "").trim();
      const glCode = String(body.glCode ?? "").trim();
      const department = String(body.department ?? "").trim();
      const amount = numberFrom(body.budgetAmount, "Budget amount");
      if (!category || !glCode || amount === null) {
        return NextResponse.json({ error: "Enter a GL code, category, and budget amount." }, { status: 400 });
      }
      const nestId = body.nestId ? Number(body.nestId) : null;
      if (nestId !== null && !nests.some((nest) => nest.nest_id === nestId && nest.country?.toLowerCase() === cycle.country.toLowerCase())) {
        return NextResponse.json({ error: "Choose a nest in the selected country." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("app_expense_budgets")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          department,
          gl_code: glCode,
          category,
          budget_amount: amount,
          notes: String(body.notes ?? "").trim() || null,
          created_by: user.userId,
        })
        .select("budget_id, cycle_id, nest_id, department, gl_code, category, budget_amount, notes, created_at")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ budget: data }, { status: 201 });
    }

    if (action === "add_request") {
      if (cycle.status !== "open" && cycle.status !== "draft") {
        return NextResponse.json({ error: "This cycle is not accepting expense requests." }, { status: 409 });
      }
      const category = String(body.category ?? "").trim();
      const glCode = String(body.glCode ?? "").trim();
      const description = String(body.description ?? "").trim();
      const requestedAmount = numberFrom(body.requestedAmount, "Requested amount");
      const quantity = numberFrom(body.quantity, "Quantity", true);
      if (!category || !glCode || !description || requestedAmount === null) {
        return NextResponse.json({ error: "Enter a GL code, category, description, and requested amount." }, { status: 400 });
      }
      const expenseType = String(body.expenseType ?? "recurring");
      if (!["recurring", "one_off", "nte_budget"].includes(expenseType)) {
        return NextResponse.json({ error: "Choose a valid expense type." }, { status: 400 });
      }
      const nestId = body.nestId ? Number(body.nestId) : null;
      if (nestId !== null && !nests.some((nest) => nest.nest_id === nestId && nest.country?.toLowerCase() === cycle.country.toLowerCase())) {
        return NextResponse.json({ error: "Choose a nest in the selected country." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("app_expense_requests")
        .insert({
          cycle_id: cycleId,
          nest_id: nestId,
          department: String(body.department ?? "").trim(),
          gl_code: glCode,
          category,
          expense_type: expenseType,
          description,
          unit_measure: String(body.unitMeasure ?? "").trim() || null,
          quantity,
          requested_amount: requestedAmount,
          vendor_name: String(body.vendorName ?? "").trim() || null,
          requester_note: String(body.note ?? "").trim() || null,
          status: "draft",
          created_by: user.userId,
        })
        .select("expense_id, cycle_id, nest_id, department, gl_code, category, expense_type, description, unit_measure, quantity, requested_amount, approved_amount, vendor_name, status, requester_note, review_note, created_by, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ request: data }, { status: 201 });
    }

    if (action === "submit_request") {
      const expenseId = String(body.expenseId ?? "");
      if (!expenseId) {
        return NextResponse.json({ error: "Choose an expense request to submit." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("app_expense_requests")
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("expense_id", expenseId)
        .eq("cycle_id", cycleId)
        .eq("status", "draft")
        .select("expense_id, status, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return NextResponse.json({ error: "Only draft requests can be submitted." }, { status: 409 });
      }
      return NextResponse.json({ request: data });
    }

    if (action === "review_request") {
      if (!canReviewExpenses(user)) {
        return NextResponse.json({ error: "You do not have permission to review expenses." }, { status: 403 });
      }
      const expenseId = String(body.expenseId ?? "");
      const status = String(body.status ?? "");
      if (!expenseId || !["in_review", "approved", "rejected", "submitted"].includes(status)) {
        return NextResponse.json({ error: "Choose a valid request and review status." }, { status: 400 });
      }
      const approvedAmount = status === "approved"
        ? numberFrom(body.approvedAmount, "Approved amount")
        : null;
      const { data, error } = await supabase
        .from("app_expense_requests")
        .update({
          status,
          approved_amount: approvedAmount,
          review_note: String(body.reviewNote ?? "").trim() || null,
          reviewed_by: user.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("expense_id", expenseId)
        .eq("cycle_id", cycleId)
        .select("expense_id, status, approved_amount, review_note, reviewed_by, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ request: data });
    }

    return NextResponse.json({ error: "Unsupported expense action." }, { status: 400 });
  } catch (error) {
    return failure(error, "Unable to save quarterly expense data.");
  }
}
