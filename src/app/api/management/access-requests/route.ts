import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const teams = ["flight", "fulfilment", "facilities"] as const;

type RequestRow = {
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

type Actor = {
  userId: string;
  roles: string[];
  countries: string[];
  nests: number[];
};

async function getActor(): Promise<Actor | null> {
  const sessionClient = await createSessionClient();
  const {
    data: claimsData,
    error: authError,
  } = await sessionClient.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    return null;
  }

  const admin = createAdminClient();

  const [
    { data: profile, error: profileError },
    { data: roleRows, error: roleError },
  ] = await Promise.all([
    admin
      .from("app_user_profiles")
      .select("is_active")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("app_user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  if (profileError || roleError || !profile?.is_active) {
    return null;
  }

  const roles = (roleRows ?? []).map((row) => row.role as string);

  const [
    { data: countryRows, error: countryError },
    { data: nestRows, error: nestError },
  ] = await Promise.all([
    admin
      .from("app_user_country_access")
      .select("country")
      .eq("user_id", userId),
    admin
      .from("app_user_nest_access")
      .select("nest_id")
      .eq("user_id", userId),
  ]);

  if (countryError || nestError) {
    throw new Error("Could not load the manager's access scope.");
  }

  return {
    userId,
    roles,
    countries: (countryRows ?? []).map((row) => row.country as string),
    nests: Array.from(
      new Set((nestRows ?? []).map((row) => Number(row.nest_id))),
    ),
  };
}

function canManageRequest(actor: Actor, row: RequestRow): boolean {
  if (actor.roles.includes("it_admin")) {
    return true;
  }

  if (
    actor.roles.includes("business_ops_manager") &&
    row.requested_country &&
    actor.countries.includes(row.requested_country)
  ) {
    return true;
  }

  return (
    actor.roles.includes("nest_lead") &&
    row.requested_role === "quartermaster" &&
    row.requested_nest_id !== null &&
    actor.nests.includes(Number(row.requested_nest_id))
  );
}

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(
        `Could not check for an existing account: ${error.message}`,
      );
    }

    const matchingUser = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (matchingUser) {
      return matchingUser;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

async function ensureRole(userId: string, role: string): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error: checkError } = await admin
    .from("app_user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing) {
    return;
  }

  const { error: insertError } = await admin.from("app_user_roles").insert({
    user_id: userId,
    role,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function ensureCountryAccess(
  userId: string,
  country: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error: checkError } = await admin
    .from("app_user_country_access")
    .select("user_id")
    .eq("user_id", userId)
    .eq("country", country)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing) {
    return;
  }

  const { error: insertError } = await admin
    .from("app_user_country_access")
    .insert({ user_id: userId, country });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function ensureNestTeamAccess(
  userId: string,
  nestId: number,
  team: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error: checkError } = await admin
    .from("app_user_nest_access")
    .select("user_id")
    .eq("user_id", userId)
    .eq("nest_id", nestId)
    .eq("team", team)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing) {
    return;
  }

  const { error: insertError } = await admin
    .from("app_user_nest_access")
    .insert({ user_id: userId, nest_id: nestId, team });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function GET() {
  try {
    const actor = await getActor();

    if (!actor) {
      return NextResponse.json(
        { error: "Sign in with an active application account." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_access_requests")
      .select(
        "request_id, user_id, requester_name, requester_email, requested_role, requested_country, requested_nest_id, requested_team, reason, status, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("Could not load access requests:", error.message);
      return NextResponse.json(
        { error: "Could not load access requests." },
        { status: 500 },
      );
    }

    const requests = ((data ?? []) as RequestRow[]).filter((row) =>
      canManageRequest(actor, row),
    );

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Access request list failed:", error);
    return NextResponse.json(
      { error: "Could not load access requests." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();

    if (!actor) {
      return NextResponse.json(
        { error: "Sign in with an active application account." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.requestId !== "string" ||
      !["approve", "reject"].includes(body.decision)
    ) {
      return NextResponse.json(
        {
          error: "Provide a request ID and an approve or reject decision.",
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: accessRequest, error: requestError } = await admin
      .from("app_access_requests")
      .select("*")
      .eq("request_id", body.requestId)
      .maybeSingle();

    if (requestError || !accessRequest) {
      return NextResponse.json(
        { error: "Access request not found." },
        { status: 404 },
      );
    }

    const row = accessRequest as RequestRow;

    if (!canManageRequest(actor, row)) {
      return NextResponse.json(
        { error: "You are not allowed to manage this request." },
        { status: 403 },
      );
    }

    if (row.status !== "pending") {
      return NextResponse.json(
        { error: "This request has already been reviewed." },
        { status: 409 },
      );
    }

    const reviewNote =
      typeof body.reviewNote === "string"
        ? body.reviewNote.trim().slice(0, 1000)
        : null;

    if (body.decision === "reject") {
      const { error: updateError } = await admin
        .from("app_access_requests")
        .update({
          status: "rejected",
          reviewed_by: actor.userId,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote,
        })
        .eq("request_id", row.request_id)
        .eq("status", "pending");

      if (updateError) {
        console.error("Could not reject access request:", updateError.message);
        return NextResponse.json(
          { error: "Could not reject this request." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        decision: "rejected",
      });
    }

    if (!row.requester_email || !row.requester_name) {
      return NextResponse.json(
        { error: "This request is missing the requester's name or email." },
        { status: 400 },
      );
    }

    const email = row.requester_email.toLowerCase();
    let authUser = await findAuthUserByEmail(email);
    let invitationSent = false;

    if (!authUser) {
      const redirectTo = new URL("/auth/confirm", request.url).toString();
      const { data: inviteData, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: row.requester_name },
          redirectTo,
        });

      if (inviteError || !inviteData.user) {
        console.error("Could not invite requester:", inviteError?.message);
        return NextResponse.json(
          {
            error:
              "Could not send the invitation. Check Supabase email settings and try again.",
          },
          { status: 502 },
        );
      }

      authUser = inviteData.user;
      invitationSent = true;
    }

    const userId = authUser.id;

    const { error: profileError } = await admin
      .from("app_user_profiles")
      .upsert(
        {
          user_id: userId,
          email,
          full_name: row.requester_name,
          is_active: true,
        },
        { onConflict: "user_id" },
      );

    if (profileError) {
      throw new Error(profileError.message);
    }

    await ensureRole(userId, row.requested_role);

    if (row.requested_role === "procurement") {
      if (!row.requested_country) {
        throw new Error("Procurement request has no country.");
      }

      await ensureCountryAccess(userId, row.requested_country);
    } else if (row.requested_role === "nest_lead") {
      if (!row.requested_nest_id) {
        throw new Error("Nest Lead request has no nest.");
      }

      for (const team of teams) {
        await ensureNestTeamAccess(
          userId,
          Number(row.requested_nest_id),
          team,
        );
      }
    } else if (row.requested_role === "quartermaster") {
      const team = row.requested_team;

      if (
        !row.requested_nest_id ||
        typeof team !== "string" ||
        !teams.includes(team as (typeof teams)[number])
      ) {
        throw new Error("Quartermaster request has an invalid nest or team.");
      }

      await ensureNestTeamAccess(
        userId,
        Number(row.requested_nest_id),
        team,
      );
    } else {
      throw new Error("This request role is not supported.");
    }

    const { error: auditError } = await admin
      .from("app_access_change_log")
      .insert({
        target_user_id: userId,
        changed_by: actor.userId,
        action: "grant",
        new_role: row.requested_role,
        new_country: row.requested_country,
        new_nest_id: row.requested_nest_id,
        new_team: row.requested_team,
        change_reason: `Approved access request ${row.request_id}`,
      });

    if (auditError) {
      throw new Error(auditError.message);
    }

    const { error: updateError } = await admin
      .from("app_access_requests")
      .update({
        user_id: userId,
        status: "approved",
        reviewed_by: actor.userId,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq("request_id", row.request_id)
      .eq("status", "pending");

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      success: true,
      decision: "approved",
      invitationSent,
    });
  } catch (error) {
    console.error("Access request review failed:", error);
    return NextResponse.json(
      {
        error:
          "Could not complete the access request. Check the server log.",
      },
      { status: 500 },
    );
  }
}