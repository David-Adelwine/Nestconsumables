import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedRoles = ["procurement", "nest_lead", "quartermaster"] as const;
const allowedTeams = ["flight", "fulfilment", "facilities"] as const;

type RequestRole = (typeof allowedRoles)[number];
type RequestTeam = (typeof allowedTeams)[number];

type NestRow = {
  nest_id: number;
  nest_key: string;
  nest_name: string;
  country: string | null;
};

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true)
      .order("nest_name");

    if (error) {
      console.error("Failed to load production nests:", error.message);
      return NextResponse.json(
        { error: "Could not load the production nest list." },
        { status: 500 },
      );
    }

    const nests = (data ?? []).map((nest) => ({
      id: String(nest.nest_id),
      code: nest.nest_key,
      name: nest.nest_name,
      country: nest.country,
    }));

    return NextResponse.json(
      { nests },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Nest list request failed:", error);
    return NextResponse.json(
      { error: "Could not load the production nest list." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Enter the requested access details." },
        { status: 400 },
      );
    }

    const form = body as Record<string, unknown>;

    // Honeypot field for simple automated spam.
    if (typeof form.website === "string" && form.website.trim()) {
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const name =
      typeof form.requesterName === "string" ? form.requesterName.trim() : "";
    const email =
      typeof form.requesterEmail === "string"
        ? form.requesterEmail.trim().toLowerCase()
        : "";
    const reason = typeof form.reason === "string" ? form.reason.trim() : "";

    if (name.length < 2 || name.length > 120) {
      return NextResponse.json(
        { error: "Enter your name (2 to 120 characters)." },
        { status: 400 },
      );
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "Enter a valid work email address." },
        { status: 400 },
      );
    }

    if (!isOneOf(form.requestedRole, allowedRoles)) {
      return NextResponse.json(
        { error: "Select a valid role." },
        { status: 400 },
      );
    }

    if (reason.length < 10 || reason.length > 1000) {
      return NextResponse.json(
        { error: "The reason must be between 10 and 1000 characters." },
        { status: 400 },
      );
    }

    const requestedRole: RequestRole = form.requestedRole;
    const supabase = createAdminClient();

    const { data: nestRows, error: nestError } = await supabase
      .from("company_nests")
      .select("nest_id, nest_key, nest_name, country")
      .eq("is_production_nest", true);

    if (nestError) {
      console.error("Failed to validate requested scope:", nestError.message);
      return NextResponse.json(
        { error: "Could not validate the selected country or nest." },
        { status: 500 },
      );
    }

    const productionNests = (nestRows ?? []) as NestRow[];
    let requestedCountry: string | null = null;
    let requestedNestId: number | null = null;
    let requestedTeam: RequestTeam | null = null;

    if (requestedRole === "procurement") {
      const country =
        typeof form.requestedCountry === "string"
          ? form.requestedCountry.trim()
          : "";

      const countryExists = productionNests.some(
        (nest) => nest.country === country,
      );

      if (!country || !countryExists) {
        return NextResponse.json(
          { error: "Select a country with production nests." },
          { status: 400 },
        );
      }

      requestedCountry = country;
    } else {
      const nestId =
        typeof form.requestedNestId === "string" ||
        typeof form.requestedNestId === "number"
          ? Number(form.requestedNestId)
          : NaN;

      if (!Number.isSafeInteger(nestId) || nestId <= 0) {
        return NextResponse.json(
          { error: "Select a valid production nest." },
          { status: 400 },
        );
      }

      const selectedNest = productionNests.find(
        (nest) => nest.nest_id === nestId,
      );

      if (!selectedNest || !selectedNest.country) {
        return NextResponse.json(
          { error: "Select a valid production nest." },
          { status: 400 },
        );
      }

      requestedCountry = selectedNest.country;
      requestedNestId = selectedNest.nest_id;

      if (requestedRole === "quartermaster") {
        if (!isOneOf(form.requestedTeam, allowedTeams)) {
          return NextResponse.json(
            { error: "Select a valid quartermaster team." },
            { status: 400 },
          );
        }

        requestedTeam = form.requestedTeam;
      }
    }

    const { data: existingRequest, error: existingError } = await supabase
      .from("app_access_requests")
      .select("request_id")
      .eq("requester_email", email)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Failed to check for an existing request:",
        existingError.message,
      );
      return NextResponse.json(
        { error: "Could not submit your request. Please try again." },
        { status: 500 },
      );
    }

    if (existingRequest) {
      return NextResponse.json(
        {
          error:
            "There is already a pending request for this email address.",
        },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabase
      .from("app_access_requests")
      .insert({
        user_id: null,
        requester_name: name,
        requester_email: email,
        requested_role: requestedRole,
        requested_country: requestedCountry,
        requested_nest_id: requestedNestId,
        requested_team: requestedTeam,
        reason,
        status: "pending",
      });

    if (insertError) {
      console.error("Failed to save access request:", insertError.message);
      return NextResponse.json(
        { error: "Could not submit your request. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Access request failed:", error);
    return NextResponse.json(
      { error: "Could not submit your request. Please try again." },
      { status: 500 },
    );
  }
}