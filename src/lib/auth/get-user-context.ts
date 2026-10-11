import { createClient } from "@/lib/supabase/server";

export type AppRole =
  | "it_admin"
  | "business_ops_manager"
  | "procurement"
  | "nest_lead"
  | "quartermaster"
  | "finance";

export type AppTeam = "flight" | "fulfilment" | "facilities";

export type AppUserContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  isActive: boolean;
  roles: AppRole[];
  countryAccess: string[];
  regionAccess: string[];
  nestAccess: Array<{
    nestId: string;
    team: "*" | AppTeam;
  }>;
  hasApplicationAccess: boolean;
};

const appRoles: AppRole[] = [
  "it_admin",
  "business_ops_manager",
  "procurement",
  "nest_lead",
  "quartermaster",
  "finance",
];

const appTeams: AppTeam[] = ["flight", "fulfilment", "facilities"];

function isAppRole(value: string): value is AppRole {
  return appRoles.includes(value as AppRole);
}

function isAppTeam(value: string): value is AppTeam {
  return appTeams.includes(value as AppTeam);
}

export async function getUserContext(): Promise<AppUserContext | null> {
  const supabase = await createClient();

  const { data: claimsData, error: authError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    return null;
  }

  const [
    profileResult,
    rolesResult,
    countriesResult,
    regionsResult,
    nestsResult,
  ] = await Promise.all([
    supabase
      .from("app_user_profiles")
      .select("user_id, email, full_name, is_active")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("app_user_roles")
      .select("role")
      .eq("user_id", userId),

    supabase
      .from("app_user_country_access")
      .select("country")
      .eq("user_id", userId),

    supabase
      .from("app_user_region_access")
      .select("region_id")
      .eq("user_id", userId),

    supabase
      .from("app_user_nest_access")
      .select("nest_id, team")
      .eq("user_id", userId),
  ]);

  const queryError =
    profileResult.error ??
    rolesResult.error ??
    countriesResult.error ??
    regionsResult.error ??
    nestsResult.error;

  if (queryError) {
    console.error(
      "Failed to load application user context:",
      queryError.message,
    );

    throw new Error("Unable to load your application access.");
  }

  const profile = profileResult.data;

  if (!profile) {
    return null;
  }

  const roles = (rolesResult.data ?? [])
    .map((row) => row.role)
    .filter(isAppRole);

  const nestAccess = (nestsResult.data ?? [])
    .map((row) => {
      const team = row.team;

      if (team !== "*" && !isAppTeam(team)) {
        return null;
      }

      return {
        nestId: String(row.nest_id),
        team: team as "*" | AppTeam,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const isActive = profile.is_active;

  return {
    userId,
    email: profile.email,
    fullName: profile.full_name,
    isActive,
    roles,
    countryAccess: (countriesResult.data ?? []).map((row) => row.country),
    regionAccess: (regionsResult.data ?? []).map((row) => row.region_id),
    nestAccess,
    hasApplicationAccess: isActive && roles.length > 0,
  };
}

export function hasRole(
  user: AppUserContext | null,
  role: AppRole,
): boolean {
  return Boolean(user?.isActive && user.roles.includes(role));
}