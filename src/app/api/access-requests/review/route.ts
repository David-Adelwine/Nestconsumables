import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUserContext,
  hasRole,
  type AppRole,
} from "@/lib/auth/get-user-context";

type AppUser = NonNullable<Awaited<ReturnType<typeof getUserContext>>>;
type Decision = "approved" | "declined";
type RequestRole = "procurement" | "nest_lead" | "quartermaster";
type RequestTeam = "flight" | "fulfilment" | "facilities";

type AccessRequest = {
  request_id: string;
  user_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requested_role: string;
  requested_country: string | null;
  requested_nest_id: number | null;
  requested_team: string | null;
  reason: string;
  status: string;
  created_at: string;
};

const validRoles: RequestRole[] = [
  "procurement",
  "nest_lead",
  "quartermaster",
];

const validTeams: RequestTeam[] = [
  "flight",
  "fulfilment",
  "facilities",
];

// The database CHECK constraint allows "pending", "approved", and "rejected".
const DECLINED_DATABASE_STATUS = "rejected";

function isDecision(value: unknown): value is Decision {
  return value === "approved" || value === "declined";
}

function isRequestRole(value: string): value is RequestRole {
  return validRoles.includes(value as RequestRole);
}

function isRequestTeam(value: string | null): value is RequestTeam {
  return value !== null && validTeams.includes(value as RequestTeam);
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

function getAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL;

  if (!value) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  return value.replace(/\/+$/, "");
}

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const perPage = 1000;
  const maxPages = 100;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(
        `Could not check for an existing account: ${error.message}`,
      );
    }

    const found = data.users.find(
      (authUser) => authUser.email?.toLowerCase() === email,
    );

    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Could not locate the account within the user-list limit.");
}

/**
 * Returns whether the current reviewer may review this particular request.
 *
 * Region-scoped Business Ops Managers are checked against the requested nest's
 * region assignment. A region assignment alone does not grant access to every
 * nest in the same country.
 */
async function canManageRequest(
  supabase: ReturnType<typeof createAdminClient>,
  user: AppUser,
  accessRequest: AccessRequest,
) {
  if (hasRole(user, "it_admin")) {
    return true;
  }

  const isOpsManager = hasRole(user, "business_ops_manager");
  const isProcurement = hasRole(user, "procurement");

  // A procurement-only reviewer can review Quartermaster requests only.
  // A reviewer who also has the Business Ops Manager role can use that role's
  // country or region scope.
  if (
    isProcurement &&
    !isOpsManager &&
    accessRequest.requested_role !== "quartermaster"
  ) {
    return false;
  }

  const canReviewByCountry = isOpsManager || isProcurement;

  if (canReviewByCountry && accessRequest.requested_country) {
    if (user.countryAccess.includes(accessRequest.requested_country)) {
      return true;
    }

    // Region access applies only when this request is for a nest assigned
    // to one of the reviewer's regions.
    if (
      isOpsManager &&
      accessRequest.requested_nest_id !== null &&
      user.regionAccess.length > 0
    ) {
      const { data, error } = await supabase
        .from("app_nest_regions")
        .select("nest_id")
        .eq("nest_id", accessRequest.requested_nest_id)
        .in("region_id", user.regionAccess)
        .limit(1);

      if (error) {
        throw new Error(
          `Could not check reviewer region access: ${error.message}`,
        );
      }

      if (data && data.length > 0) {
        return true;
      }
    }
  }

  // Nest Leads may review Quartermaster requests for their assigned nest and
  // team. A "*" assignment covers every team at that nest.
  if (
    hasRole(user, "nest_lead") &&
    accessRequest.requested_role === "quartermaster" &&
    accessRequest.requested_nest_id !== null &&
    isRequestTeam(accessRequest.requested_team)
  ) {
    return user.nestAccess.some(
      (assignment) =>
        assignment.nestId === String(accessRequest.requested_nest_id) &&
        (assignment.team === "*" ||
          assignment.team === accessRequest.requested_team),
    );
  }

  return false;
}

async function ensureRole(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: AppRole,
) {
  const { data, error } = await supabase
    .from("app_user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check the user's role: ${error.message}`);
  }

  if (data) return;

  const { error: insertError } = await supabase
    .from("app_user_roles")
    .insert({ user_id: userId, role });

  if (insertError) {
    throw new Error(`Could not assign the user's role: ${insertError.message}`);
  }
}

async function ensureCountryAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  country: string,
) {
  const { data, error } = await supabase
    .from("app_user_country_access")
    .select("user_id")
    .eq("user_id", userId)
    .eq("country", country)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check country access: ${error.message}`);
  }

  if (data) return;

  const { error: insertError } = await supabase
    .from("app_user_country_access")
    .insert({ user_id: userId, country });

  if (insertError) {
    throw new Error(`Could not assign country access: ${insertError.message}`);
  }
}

async function ensureNestAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  nestId: number,
  team: "*" | RequestTeam,
) {
  const { data, error } = await supabase
    .from("app_user_nest_access")
    .select("user_id")
    .eq("user_id", userId)
    .eq("nest_id", nestId)
    .eq("team", team)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check nest access: ${error.message}`);
  }

  if (data) return;

  const { error: insertError } = await supabase
    .from("app_user_nest_access")
    .insert({
      user_id: userId,
      nest_id: nestId,
      team,
    });

  if (insertError) {
    throw new Error(`Could not assign nest access: ${insertError.message}`);
  }
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error("Resend email request failed:", response.status, responseText);
    throw new Error("The email provider could not send the message.");
  }
}

async function sendApprovalEmail({
  email,
  name,
  actionLink,
}: {
  email: string;
  name: string;
  actionLink: string;
}) {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(actionLink);

  await sendEmail({
    to: email,
    subject: "Your Consumables app access has been approved",
    text: [
      `Hello ${name},`,
      "",
      "Your access request has been approved.",
      "Use this link to set or reset your password and sign in:",
      actionLink,
      "",
      "If you did not request access, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>Hello ${safeName},</p>
      <p>Your access request has been approved.</p>
      <p><a href="${safeLink}">Set or reset your password</a></p>
      <p>If you did not request access, you can ignore this email.</p>
    `,
  });
}

async function sendDeclineEmail({
  email,
  name,
}: {
  email: string;
  name: string;
}) {
  const safeName = escapeHtml(name);

  await sendEmail({
    to: email,
    subject: "Update on your Consumables app access request",
    text: [
      `Hello ${name},`,
      "",
      "Your Consumables app access request was not approved.",
      "Please contact your manager if you need more information.",
    ].join("\n"),
    html: `
      <p>Hello ${safeName},</p>
      <p>Your Consumables app access request was not approved.</p>
      <p>Please contact your manager if you need more information.</p>
    `,
  });
}

async function provisionApprovedRequest(
  supabase: ReturnType<typeof createAdminClient>,
  accessRequest: AccessRequest,
) {
  const email = accessRequest.requester_email?.trim().toLowerCase();

  if (!email) {
    throw new Error("The access request does not contain an email address.");
  }

  if (!isRequestRole(accessRequest.requested_role)) {
    throw new Error("The requested role is not supported.");
  }

  const name = accessRequest.requester_name?.trim() || "there";
  const redirectTo = new URL("/auth/confirm", `${getAppUrl()}/`);
  redirectTo.searchParams.set("next", "/set-password");

  const existingAuthUser = await findAuthUserByEmail(supabase, email);

  // Keep these as separate calls. `data` is supported for invite links,
  // but not recovery links.
  const linkResult = existingAuthUser
    ? await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: redirectTo.toString(),
        },
      })
    : await supabase.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: redirectTo.toString(),
          data: {
            full_name: name,
          },
        },
      });

  if (linkResult.error) {
    throw new Error(
      `Could not generate the password link: ${linkResult.error.message}`,
    );
  }

  const authUser = linkResult.data.user;
  const actionLink = linkResult.data.properties?.action_link;

  if (!authUser?.id || !actionLink) {
    throw new Error("Supabase did not return a user and password link.");
  }

  const userId = authUser.id;

  const { error: profileError } = await supabase
    .from("app_user_profiles")
    .upsert(
      {
        user_id: userId,
        email,
        full_name: name,
        is_active: true,
      },
      { onConflict: "user_id" },
    );

  if (profileError) {
    throw new Error(
      `Could not create the user profile: ${profileError.message}`,
    );
  }

  await ensureRole(supabase, userId, accessRequest.requested_role);

  if (accessRequest.requested_role === "procurement") {
    if (!accessRequest.requested_country) {
      throw new Error("A procurement request must include a country.");
    }

    await ensureCountryAccess(
      supabase,
      userId,
      accessRequest.requested_country,
    );
  } else {
    if (accessRequest.requested_nest_id === null) {
      throw new Error("A nest access request must include a nest.");
    }

    let team: "*" | RequestTeam;

    if (accessRequest.requested_role === "nest_lead") {
      team = "*";
    } else if (isRequestTeam(accessRequest.requested_team)) {
      team = accessRequest.requested_team;
    } else {
      throw new Error("A Quartermaster request must include a valid team.");
    }

    await ensureNestAccess(
      supabase,
      userId,
      accessRequest.requested_nest_id,
      team,
    );
  }

  const { error: requestUpdateError } = await supabase
    .from("app_access_requests")
    .update({ user_id: userId })
    .eq("request_id", accessRequest.request_id);

  if (requestUpdateError) {
    throw new Error(
      `Could not link the request to the new user: ${requestUpdateError.message}`,
    );
  }

  await sendApprovalEmail({
    email,
    name,
    actionLink,
  });
}

/**
 * Loads pending requests the signed-in reviewer is allowed to review.
 * Used by the access request queues on the reviewer dashboards.
 */
export async function GET() {
  try {
    const user = await getUserContext();

    if (!user?.isActive) {
      return NextResponse.json(
        { error: "Please sign in with an active account." },
        { status: 401 },
      );
    }

    const canViewReviewQueue =
      hasRole(user, "it_admin") ||
      hasRole(user, "business_ops_manager") ||
      hasRole(user, "procurement") ||
      hasRole(user, "nest_lead");

    if (!canViewReviewQueue) {
      return NextResponse.json(
        { error: "You do not have access to the access request queue." },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("app_access_requests")
      .select(
        "request_id, user_id, requester_name, requester_email, requested_role, requested_country, requested_nest_id, requested_team, reason, status, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Could not load pending access requests:", error.message);
      return NextResponse.json(
        { error: "Could not load pending access requests." },
        { status: 500 },
      );
    }

    const pendingRequests = (data ?? []) as AccessRequest[];
    const visibleRequests = [];

    for (const accessRequest of pendingRequests) {
      if (!accessRequest.requester_email) continue;

      if (await canManageRequest(supabase, user, accessRequest)) {
        visibleRequests.push({
          id: accessRequest.request_id,
          requesterName: accessRequest.requester_name ?? "",
          requesterEmail: accessRequest.requester_email,
          role: accessRequest.requested_role,
          country: accessRequest.requested_country,
          nestId:
            accessRequest.requested_nest_id === null
              ? ""
              : String(accessRequest.requested_nest_id),
          team: accessRequest.requested_team,
          reason: accessRequest.reason,
          createdAt: accessRequest.created_at,
        });
      }
    }

    return NextResponse.json(
      {
        // `requests` is used by the shared dashboard queue.
        requests: visibleRequests,
        // Kept as an alias for dashboards that use this property name.
        pendingAccessRequests: visibleRequests,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Access request queue GET failed:", error);

    return NextResponse.json(
      { error: "Unable to load access request data." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserContext();

    if (!user?.isActive) {
      return NextResponse.json(
        { error: "Please sign in with an active account." },
        { status: 401 },
      );
    }

    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Enter the access request and decision." },
        { status: 400 },
      );
    }

    const form = body as Record<string, unknown>;
    const requestId =
      typeof form.requestId === "string" ? form.requestId.trim() : "";
    const decision = form.decision;
    const reviewNote =
      typeof form.reviewNote === "string" ? form.reviewNote.trim() : "";

    if (!isUuid(requestId)) {
      return NextResponse.json(
        { error: "Enter a valid access request ID." },
        { status: 400 },
      );
    }

    if (!isDecision(decision)) {
      return NextResponse.json(
        { error: "Select approve or decline." },
        { status: 400 },
      );
    }

    if (reviewNote.length > 1000) {
      return NextResponse.json(
        { error: "The review note cannot exceed 1000 characters." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: requestRow, error: requestError } = await supabase
      .from("app_access_requests")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();

    if (requestError) {
      console.error("Could not load access request:", requestError.message);
      return NextResponse.json(
        { error: "Could not load this access request." },
        { status: 500 },
      );
    }

    if (!requestRow) {
      return NextResponse.json(
        { error: "This access request could not be found." },
        { status: 404 },
      );
    }

    const accessRequest = requestRow as AccessRequest;

    if (accessRequest.status !== "pending") {
      return NextResponse.json(
        { error: "This access request has already been reviewed." },
        { status: 409 },
      );
    }

    if (!accessRequest.requester_email) {
      return NextResponse.json(
        { error: "This access request has no email address." },
        { status: 400 },
      );
    }

    if (
      user.email?.toLowerCase() ===
      accessRequest.requester_email.trim().toLowerCase()
    ) {
      return NextResponse.json(
        { error: "You cannot review your own access request." },
        { status: 403 },
      );
    }

    const authorized = await canManageRequest(
      supabase,
      user,
      accessRequest,
    );

    if (!authorized) {
      return NextResponse.json(
        { error: "You do not have permission to review this request." },
        { status: 403 },
      );
    }

    const databaseStatus =
      decision === "approved" ? "approved" : DECLINED_DATABASE_STATUS;

    // Claim the pending request once so two reviewers cannot process it at
    // the same time.
    const { data: claimedRequest, error: claimError } = await supabase
      .from("app_access_requests")
      .update({
        status: databaseStatus,
        reviewed_by: user.userId,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote || null,
      })
      .eq("request_id", requestId)
      .eq("status", "pending")
      .select("request_id")
      .maybeSingle();

    if (claimError) {
      console.error("Could not update access request:", claimError.message);
      return NextResponse.json(
        { error: "Could not record the review decision." },
        { status: 500 },
      );
    }

    if (!claimedRequest) {
      return NextResponse.json(
        { error: "Another reviewer has already processed this request." },
        { status: 409 },
      );
    }

    if (decision === "declined") {
      try {
        await sendDeclineEmail({
          email: accessRequest.requester_email.trim().toLowerCase(),
          name: accessRequest.requester_name?.trim() || "there",
        });

        return NextResponse.json({
          success: true,
          decision,
          notificationSent: true,
        });
      } catch (emailError) {
        console.error("Decline email could not be sent:", emailError);

        return NextResponse.json({
          success: true,
          decision,
          notificationSent: false,
          notificationError:
            "The request was declined, but the email could not be sent. Check the Resend settings.",
        });
      }
    }

    try {
      await provisionApprovedRequest(supabase, accessRequest);

      return NextResponse.json({
        success: true,
        decision,
        notificationSent: true,
      });
    } catch (provisionError) {
      console.error("Access request approval failed:", provisionError);

      // Return the request to pending so an authorized reviewer can retry.
      const { error: rollbackError } = await supabase
        .from("app_access_requests")
        .update({
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
        })
        .eq("request_id", requestId)
        .eq("status", "approved")
        .eq("reviewed_by", user.userId);

      if (rollbackError) {
        console.error(
          "Could not return request to pending:",
          rollbackError.message,
        );
      }

      return NextResponse.json(
        {
          error:
            "The request was not fully processed. Check the server logs and try again.",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Access request review failed:", error);

    return NextResponse.json(
      { error: "Unable to review this access request." },
      { status: 500 },
    );
  }
}