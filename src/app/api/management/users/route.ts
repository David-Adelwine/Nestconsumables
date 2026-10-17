import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";
import type { AppUserContext } from "@/lib/auth/get-user-context";

const manageableRoles = [
  "business_ops_manager",
  "procurement",
  "nest_lead",
  "quartermaster",
  "finance",
] as const;

const teams = ["flight", "fulfilment", "facilities"] as const;

type ManageableRole = (typeof manageableRoles)[number];
type Team = (typeof teams)[number];
type Operation = "grant" | "revoke_role" | "deactivate" | "reactivate";

type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
};

type GrantRecipient = {
  email: string | null;
  fullName: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRole(value: unknown): value is ManageableRole {
  return (
    typeof value === "string" &&
    manageableRoles.includes(value as ManageableRole)
  );
}

function isTeam(value: unknown): value is Team {
  return typeof value === "string" && teams.includes(value as Team);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dashboardForRole(role: ManageableRole) {
  switch (role) {
    case "finance":
      return { name: "Finance", path: "/finance/dashboard" };
    case "procurement":
      return { name: "Procurement", path: "/procurement" };
    case "nest_lead":
      return { name: "Nest Lead", path: "/lead/dashboard" };
    case "quartermaster":
      return { name: "Quartermaster", path: "/quartermaster/dashboard" };
    case "business_ops_manager":
      return { name: "Workspace dashboards", path: "/dashboard" };
  }
}

function formatRole(role: ManageableRole) {
  switch (role) {
    case "business_ops_manager":
      return "Business Ops Manager";
    case "nest_lead":
      return "Nest Lead";
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

function formatTeam(team: string | null) {
  switch (team) {
    case "flight":
      return "Flight";
    case "fulfilment":
      return "Fulfilment";
    case "facilities":
      return "Facilities";
    default:
      return "assigned team";
  }
}

type AdminCheck =
  | { ok: true; user: AppUserContext }
  | { ok: false; response: NextResponse };

async function requireAdmin(): Promise<AdminCheck> {
  const user = await getUserContext();

  if (!user?.isActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Please sign in with an active account." },
        { status: 401 },
      ),
    };
  }

  if (!hasRole(user, "it_admin")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only IT Admins can manage users." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}

async function sendAccessGrantedEmail({
  to,
  name,
  roleName,
  scopeDescription,
  dashboardName,
  dashboardPath,
}: {
  to: string;
  name: string;
  roleName: string;
  scopeDescription: string;
  dashboardName: string;
  dashboardPath: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!apiKey || !from || !configuredAppUrl) {
    throw new Error(
      "RESEND_API_KEY, RESEND_FROM_EMAIL, or NEXT_PUBLIC_APP_URL is not configured.",
    );
  }

  const appUrl = configuredAppUrl.replace(/\/+$/, "");
  const loginUrl = `${appUrl}/login`;
  const dashboardUrl = `${appUrl}${dashboardPath}`;

  const safeName = escapeHtml(name);
  const safeRoleName = escapeHtml(roleName);
  const safeScopeDescription = escapeHtml(scopeDescription);
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeDashboardUrl = escapeHtml(dashboardUrl);
  const safeDashboardName = escapeHtml(dashboardName);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Access granted: ${dashboardName}`,
      text: [
        `Hello ${name},`,
        "",
        `You have been given ${roleName} access.`,
        `Access scope: ${scopeDescription}.`,
        "",
        `Sign in to the Consumables app: ${loginUrl}`,
        `Open your assigned dashboard: ${dashboardUrl}`,
        "",
        "Sign in with your existing account to use the dashboard.",
      ].join("\n"),
      html: `
        <div style="margin:0;background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;padding:32px">
            <p style="margin:0;color:#6d28d9;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">
              Consumables app
            </p>
            <h1 style="margin:12px 0 0;font-size:24px">Dashboard access granted</h1>
            <p style="margin:20px 0 0">Hello ${safeName},</p>
            <p style="margin:12px 0 0;line-height:1.6">
              You have been given <strong>${safeRoleName}</strong> access.
            </p>
            <p style="margin:8px 0 0;color:#475569;line-height:1.6">
              <strong>Access scope:</strong> ${safeScopeDescription}
            </p>
            <p style="margin:24px 0">
              <a href="${safeLoginUrl}" style="display:inline-block;border-radius:10px;background:#6d28d9;padding:13px 20px;color:#ffffff;text-decoration:none;font-weight:700">
                Sign in to the app
              </a>
            </p>
            <p style="margin:0;color:#475569;line-height:1.6">
              Your assigned dashboard is
              <a href="${safeDashboardUrl}" style="color:#6d28d9;font-weight:700">${safeDashboardName}</a>.
              Sign in with your existing account to open it.
            </p>
          </div>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error(
      "Resend access notification failed:",
      response.status,
      responseText,
    );
    throw new Error("The email provider could not send the notification.");
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const search = request.nextUrl.searchParams.get("email")?.trim() ?? "";

  if (search.length < 3 || search.length > 254) {
    return NextResponse.json(
      { error: "Enter at least 3 characters of an email address." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const safeSearch = search.replace(/[\\%_]/g, "\\$&");

    const [
      { data: profiles, error: profileError },
      { data: nestRows, error: nestError },
    ] = await Promise.all([
      admin
        .from("app_user_profiles")
        .select("user_id, email, full_name, is_active")
        .ilike("email", `%${safeSearch}%`)
        .order("email")
        .limit(15),
      admin
        .from("company_nests")
        .select("nest_id, nest_key, nest_name, country")
        .eq("is_production_nest", true)
        .order("nest_name"),
    ]);

    if (profileError || nestError) {
      console.error(
        "User management lookup failed:",
        profileError?.message ?? nestError?.message,
      );
      return NextResponse.json(
        { error: "Could not load users or production nests." },
        { status: 500 },
      );
    }

    const userRows = (profiles ?? []) as ProfileRow[];

    const users = await Promise.all(
      userRows.map(async (profile) => {
        const [roles, countries, regions, nests] = await Promise.all([
          admin
            .from("app_user_roles")
            .select("role")
            .eq("user_id", profile.user_id),
          admin
            .from("app_user_country_access")
            .select("country")
            .eq("user_id", profile.user_id),
          admin
            .from("app_user_region_access")
            .select("region_id")
            .eq("user_id", profile.user_id),
          admin
            .from("app_user_nest_access")
            .select("nest_id, team")
            .eq("user_id", profile.user_id),
        ]);

        const queryError =
          roles.error ?? countries.error ?? regions.error ?? nests.error;

        if (queryError) {
          throw new Error(queryError.message);
        }

        return {
          id: profile.user_id,
          email: profile.email,
          fullName: profile.full_name,
          isActive: profile.is_active,
          roles: (roles.data ?? []).map((row) => String(row.role)),
          countries: (countries.data ?? []).map((row) => String(row.country)),
          regions: (regions.data ?? []).map((row) => String(row.region_id)),
          nests: (nests.data ?? []).map((row) => ({
            nestId: String(row.nest_id),
            team: String(row.team),
          })),
        };
      }),
    );

    const nests = (nestRows ?? []).map((nest) => ({
      id: String(nest.nest_id),
      code: nest.nest_key,
      name: nest.nest_name,
      country: nest.country,
    }));

    const countries = [
      ...new Set(
        nests
          .map((nest) => nest.country)
          .filter((country): country is string => Boolean(country)),
      ),
    ].sort();

    return NextResponse.json(
      { users, countries, nests },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("User management search failed:", error);
    return NextResponse.json(
      { error: "Could not load the requested user data." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Enter a valid user-management action." },
      { status: 400 },
    );
  }

  const targetUserId =
    typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const operation = body.operation;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(targetUserId)) {
    return NextResponse.json({ error: "Select a valid user." }, { status: 400 });
  }

  if (
    !(
      operation === "grant" ||
      operation === "revoke_role" ||
      operation === "deactivate" ||
      operation === "reactivate"
    )
  ) {
    return NextResponse.json(
      { error: "Select a valid action." },
      { status: 400 },
    );
  }

  if (reason.length < 5 || reason.length > 500) {
    return NextResponse.json(
      { error: "Enter a reason between 5 and 500 characters." },
      { status: 400 },
    );
  }

  let role: ManageableRole | null = null;
  let country: string | null = null;
  let nestId: number | null = null;
  let team: string | null = null;

  if (operation === "grant" || operation === "revoke_role") {
    if (!isRole(body.role)) {
      return NextResponse.json(
        { error: "Select a role that can be managed here." },
        { status: 400 },
      );
    }
    role = body.role;
  }

  if (operation === "grant") {
    if (
      role === "business_ops_manager" ||
      role === "procurement" ||
      role === "finance"
    ) {
      country =
        typeof body.country === "string"
          ? body.country.trim().toUpperCase()
          : "";

      if (!country) {
        return NextResponse.json(
          { error: "Select a country for this role." },
          { status: 400 },
        );
      }
    } else {
      nestId =
        typeof body.nestId === "string" || typeof body.nestId === "number"
          ? Number(body.nestId)
          : NaN;

      if (!Number.isSafeInteger(nestId) || nestId <= 0) {
        return NextResponse.json(
          { error: "Select a production nest for this role." },
          { status: 400 },
        );
      }

      if (role === "nest_lead") {
        team = "*";
      } else if (isTeam(body.team)) {
        team = body.team;
      } else {
        return NextResponse.json(
          { error: "Select a valid Quartermaster team." },
          { status: 400 },
        );
      }
    }
  }

  try {
    const admin = createAdminClient();
    let recipient: GrantRecipient | null = null;

    if (operation === "grant") {
      const { data: profile, error: profileError } = await admin
        .from("app_user_profiles")
        .select("email, full_name")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (profileError) {
        console.error(
          "Could not load user for access notification:",
          profileError.message,
        );
        return NextResponse.json(
          { error: "Could not load the selected user." },
          { status: 500 },
        );
      }

      if (!profile) {
        return NextResponse.json(
          { error: "The application user was not found." },
          { status: 404 },
        );
      }

      recipient = {
        email: profile.email,
        fullName: profile.full_name,
      };
    }

    const { data, error } = await admin.rpc("admin_manage_user_access", {
      p_actor_user_id: auth.user.userId,
      p_target_user_id: targetUserId,
      p_operation: operation,
      p_role: role,
      p_country: country,
      p_nest_id: nestId,
      p_team: team,
      p_reason: reason,
    });

    if (error) {
      console.error("User access change failed:", error.message);

      const expectedMessages = [
        "Only an active IT Admin can manage application access.",
        "You cannot revoke your own application access.",
        "The last active IT Admin cannot be deactivated.",
        "The application user was not found.",
        "Select a country with production nests.",
        "Select a production nest.",
        "Select a valid Quartermaster team.",
      ];

      const friendly = expectedMessages.find((message) =>
        error.message.includes(message),
      );

      return NextResponse.json(
        { error: friendly ?? "Could not apply the access change." },
        {
          status:
            error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400,
        },
      );
    }

    const result = isRecord(data) ? data : {};
    const changed = result.changed === true;

    let notificationSent: boolean | null = null;
    let notificationError: string | null = null;

    if (operation === "grant" && changed && role && recipient) {
      if (!recipient.email?.trim()) {
        notificationSent = false;
        notificationError =
          "Access was saved, but the user's profile has no email address.";
      } else {
        try {
          const dashboard = dashboardForRole(role);
          let scopeDescription: string;

          if (
            role === "business_ops_manager" ||
            role === "procurement" ||
            role === "finance"
          ) {
            scopeDescription = country ?? "assigned country";
          } else {
            if (nestId === null) {
              throw new Error("The selected nest is missing.");
            }

            const { data: nest, error: nestError } = await admin
              .from("company_nests")
              .select("nest_key, nest_name, country")
              .eq("nest_id", nestId)
              .maybeSingle();

            if (nestError) {
              throw new Error("Could not load the assigned nest details.");
            }

            const nestLabel = nest
              ? `${nest.nest_key} · ${nest.nest_name}`
              : `Nest ${nestId}`;

            scopeDescription =
              role === "nest_lead"
                ? `${nestLabel}, all teams`
                : `${nestLabel}, ${formatTeam(team)}`;

            if (nest?.country) {
              scopeDescription += `, ${nest.country}`;
            }
          }

          await sendAccessGrantedEmail({
            to: recipient.email.trim().toLowerCase(),
            name: recipient.fullName?.trim() || "there",
            roleName: formatRole(role),
            scopeDescription,
            dashboardName: dashboard.name,
            dashboardPath: dashboard.path,
          });

          notificationSent = true;
        } catch (emailError) {
          console.error(
            "Access was granted but notification email failed:",
            emailError,
          );
          notificationSent = false;
          notificationError =
            "Access was saved, but the notification email could not be sent. Check the Resend settings.";
        }
      }
    }

    return NextResponse.json({
      success: true,
      changed,
      notificationSent,
      notificationError,
      result: data,
    });
  } catch (error) {
    console.error("User access change request failed:", error);
    return NextResponse.json(
      { error: "Could not apply the access change." },
      { status: 500 },
    );
  }
}