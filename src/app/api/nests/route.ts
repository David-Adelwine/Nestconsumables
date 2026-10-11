import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: authError,
  } = await supabase.auth.getClaims();

  if (authError || typeof claimsData?.claims?.sub !== "string") {
    return NextResponse.json(
      { error: "You must be signed in to view nests." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("company_nests")
    .select(
      "nest_id, nest_key, nest_name, country, location, is_production_nest, nest_type, timezone",
    )
    .eq("is_production_nest", true)
    .order("nest_name");

  if (error) {
    console.error("Failed to load company nests:", error.message);

    return NextResponse.json(
      { error: "Could not load nests." },
      { status: 500 },
    );
  }

  const nests = (data ?? []).map((nest) => ({
    id: String(nest.nest_id),
    code: nest.nest_key,
    name: nest.nest_name,
    country: nest.country,
    location: nest.location,
    type: nest.nest_type,
    timezone: nest.timezone,
    isProductionNest: nest.is_production_nest,
  }));

  return NextResponse.json({ nests });
}