"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

type UserRole =
  | "it_admin"
  | "business_ops_manager"
  | "procurement"
  | "nest_lead"
  | "quartermaster"
  | "finance";

type ManagedUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  isActive: boolean;
  roles: UserRole[];
  countries: string[];
  regions: string[];
  nests: Array<{ nestId: string; team: string }>;
};

type NestOption = {
  id: string;
  code: string;
  name: string;
  country: string | null;
};

type SearchResult = {
  users: ManagedUser[];
  countries: string[];
  nests: NestOption[];
};

type Operation = "grant" | "revoke_role" | "deactivate" | "reactivate";

type ChangeResponse = {
  success?: boolean;
  changed?: boolean;
  notificationSent?: boolean | null;
  notificationError?: string | null;
  error?: string;
};

const manageableRoles: Array<{
  value: Exclude<UserRole, "it_admin">;
  label: string;
  description: string;
}> = [
  {
    value: "business_ops_manager",
    label: "Business Ops Manager",
    description: "Access to the assigned country's operational dashboards.",
  },
  {
    value: "procurement",
    label: "Procurement",
    description: "Manage procurement work in the assigned country.",
  },
  {
    value: "nest_lead",
    label: "Nest Lead",
    description: "Lead access across all teams at the selected nest.",
  },
  {
    value: "quartermaster",
    label: "Quartermaster",
    description: "Manage inventory for a team at the selected nest.",
  },
  {
    value: "finance",
    label: "Finance",
    description: "Finance dashboard access for the assigned country.",
  },
];

const teamLabels: Record<string, string> = {
  "*": "All teams",
  flight: "Flight",
  fulfilment: "Fulfilment",
  facilities: "Facilities",
};

const inputClass =
  "block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] font-medium text-slate-950 caret-violet-700 shadow-sm outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const labelClass = "mb-2 block text-sm font-semibold text-slate-800";

function roleLabel(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      )}
    </div>
  );
}

function Icon({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function formatScope(user: ManagedUser, result: SearchResult) {
  const countryText = user.countries.length
    ? user.countries.join(", ")
    : "No country scope";

  const nestText = user.nests.length
    ? user.nests
        .map((assignment) => {
          const nest = result.nests.find(
            (option) => option.id === assignment.nestId,
          );
          const label = nest
            ? `${nest.code} · ${nest.name}`
            : `Nest ${assignment.nestId}`;

          return `${label} · ${teamLabels[assignment.team] ?? assignment.team}`;
        })
        .join("; ")
    : "No nest scope";

  return { countryText, nestText };
}

export default function UserManagementClient() {
  const [emailQuery, setEmailQuery] = useState("");
  const [result, setResult] = useState<SearchResult>({
    users: [],
    countries: [],
    nests: [],
  });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] =
    useState<Exclude<UserRole, "it_admin">>("quartermaster");
  const [country, setCountry] = useState("");
  const [nestId, setNestId] = useState("");
  const [team, setTeam] = useState("flight");
  const [reason, setReason] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");

  const selectedUser =
    result.users.find((user) => user.id === selectedUserId) ?? null;

  const selectedRole = manageableRoles.find((item) => item.value === role)!;
  const isCountryRole =
    role === "business_ops_manager" ||
    role === "procurement" ||
    role === "finance";

  function clearMessages() {
    setError("");
    setNotice("");
    setWarning("");
  }

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    const query = emailQuery.trim();
    if (query.length < 3) {
      setError("Enter at least 3 characters of an email address.");
      return;
    }

    setIsSearching(true);
    setSelectedUserId("");

    try {
      const response = await fetch(
        `/api/management/users?email=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not search users.");
      }

      const nextResult = payload as SearchResult;
      setResult(nextResult);

      if (nextResult.users.length === 1) {
        setSelectedUserId(nextResult.users[0].id);
      } else if (nextResult.users.length === 0) {
        setNotice("No application users matched that email search.");
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Could not search users.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function refreshUsers() {
    const response = await fetch(
      `/api/management/users?email=${encodeURIComponent(emailQuery.trim())}`,
      { cache: "no-store" },
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.error ?? "The change was saved, but the list did not refresh.",
      );
    }

    setResult(payload as SearchResult);
  }

  async function applyAction(
    operation: Operation,
    options: { role?: string } = {},
  ) {
    if (!selectedUser || isSaving) return;

    if (operation === "deactivate") {
      const confirmed = window.confirm(
        `Revoke all application access for ${
          selectedUser.email ?? "this user"
        }? Their Supabase account will remain.`,
      );

      if (!confirmed) return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError(
        "Enter a reason of at least 5 characters before changing access.",
      );
      setNotice("");
      setWarning("");
      return;
    }

    setIsSaving(true);
    clearMessages();

    try {
      const response = await fetch("/api/management/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUser.id,
          operation,
          role: options.role ?? (operation === "grant" ? role : undefined),
          country:
            operation === "grant" && isCountryRole ? country.trim() : undefined,
          nestId: operation === "grant" && !isCountryRole ? nestId : undefined,
          team:
            operation === "grant" && role === "quartermaster"
              ? team
              : operation === "grant" && role === "nest_lead"
                ? "*"
                : undefined,
          reason: trimmedReason,
        }),
      });

      const payload = (await response.json()) as ChangeResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update user access.");
      }

      setReason("");

      let successMessage =
        operation === "reactivate"
          ? "Profile reactivated. Grant a role to restore dashboard access."
          : operation === "grant"
            ? "Access updated."
            : "Access change saved.";

      let warningMessage = "";

      if (operation === "grant") {
        if (payload.changed === false) {
          successMessage =
            "No access change was needed. This role and scope are already assigned; no email was sent.";
        } else if (payload.notificationSent === true) {
          successMessage = `Access updated. Notification sent to ${
            selectedUser.email ?? "the user"
          }.`;
        } else if (payload.notificationSent === false) {
          warningMessage =
            payload.notificationError ??
            "Access was saved, but the notification email could not be sent.";
        }
      }

      try {
        await refreshUsers();
      } catch {
        warningMessage = [
          warningMessage,
          "The change was saved, but the user details could not be refreshed. Search again to reload them.",
        ]
          .filter(Boolean)
          .join(" ");
      }

      setNotice(successMessage);
      setWarning(warningMessage);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update user access.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleRoleChange(value: string) {
    setRole(value as Exclude<UserRole, "it_admin">);
    setCountry("");
    setNestId("");
    setTeam("flight");
    clearMessages();
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId);
    setReason("");
    clearMessages();
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-slate-950 px-6 py-8 text-white shadow-xl shadow-violet-950/10 sm:px-9 sm:py-10">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-violet-600/35 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 left-1/3 -z-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
        />

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-xs font-bold text-violet-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              IT ADMINISTRATION
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              User management
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Find an application account, manage its dashboard roles, and
              review its current access scopes.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <p className="font-semibold text-white">Access changes are logged</p>
            <p className="mt-1 text-xs text-slate-400">
              Add a reason with each change.
            </p>
          </div>
        </div>

        <form
          onSubmit={searchUsers}
          className="mt-8 rounded-2xl border border-white/10 bg-white p-2 shadow-lg sm:flex sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <Icon className="h-5 w-5 shrink-0 text-violet-700">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.5 4.5" />
            </Icon>
            <div className="min-w-0 flex-1 py-1">
              <label
                htmlFor="user-email-search"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
              >
                Search application users
              </label>
              <input
                id="user-email-search"
                name="email"
                type="text"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={emailQuery}
                onChange={(event) => {
                  setEmailQuery(event.currentTarget.value);
                  clearMessages();
                }}
                placeholder="Start typing an email address"
                minLength={3}
                maxLength={254}
                required
                className="mt-1 w-full border-0 bg-transparent p-0 text-[15px] font-medium text-slate-950 caret-violet-700 outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-0"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-800 px-5 text-sm font-bold text-white transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-500/30 disabled:cursor-wait disabled:opacity-60 sm:mt-0 sm:w-auto"
          >
            {isSearching ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Searching
              </>
            ) : (
              <>
                Search users
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>
      </section>

      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="font-bold">!</span>
          <p>{error}</p>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {notice}
        </div>
      )}

      {warning && (
        <div
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          {warning}
        </div>
      )}

      {result.users.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.5fr)]">
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Matches
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  {result.users.length}{" "}
                  {result.users.length === 1 ? "account" : "accounts"}
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Select an account
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {result.users.map((user) => {
                const isSelected = selectedUserId === user.id;

                return (
                  <button
                    key={user.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectUser(user.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left transition last:border-b-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-violet-500/25 ${
                      isSelected
                        ? "bg-violet-50"
                        : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${
                        isSelected
                          ? "bg-violet-800 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {(user.fullName || user.email || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950">
                        {user.fullName || "Name not set"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {user.email || "No email on profile"}
                      </span>
                    </span>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        user.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedUser ? (
            <div className="space-y-5">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-white to-violet-50/70 p-5 sm:p-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-800 text-lg font-bold text-white shadow-md shadow-violet-900/15">
                      {(selectedUser.fullName || selectedUser.email || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">
                        Selected account
                      </p>
                      <h2 className="mt-1 truncate text-xl font-bold text-slate-950">
                        {selectedUser.fullName || "Name not set"}
                      </h2>
                      <p className="mt-1 break-all text-sm text-slate-600">
                        {selectedUser.email || "No email on profile"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      selectedUser.isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {selectedUser.isActive
                      ? "Application access active"
                      : "Application access disabled"}
                  </span>
                </div>

                <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Dashboard roles
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedUser.roles.length ? (
                        selectedUser.roles.map((userRole) => (
                          <span
                            key={userRole}
                            className="inline-flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900"
                          >
                            {roleLabel(userRole)}
                            {userRole !== "it_admin" && (
                              <button
                                type="button"
                                aria-label={`Remove ${roleLabel(userRole)} role`}
                                disabled={isSaving}
                                onClick={() =>
                                  applyAction("revoke_role", {
                                    role: userRole,
                                  })
                                }
                                className="rounded px-1 font-bold text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            )}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          No dashboard roles assigned.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Current scopes
                    </p>
                    {(() => {
                      const scopes = formatScope(selectedUser, result);
                      return (
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <p>
                            <span className="font-semibold">Countries:</span>{" "}
                            {scopes.countryText}
                          </p>
                          <p>
                            <span className="font-semibold">Nests:</span>{" "}
                            {scopes.nestText}
                          </p>
                          <p>
                            <span className="font-semibold">Regions:</span>{" "}
                            {selectedUser.regions.length
                              ? selectedUser.regions.join(", ")
                              : "No region scope"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <SectionTitle
                    eyebrow="Grant access"
                    title="Add a dashboard role"
                    description="Choose the role and the country or nest it applies to."
                  />

                  <form
                    className="mt-5 space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyAction("grant");
                    }}
                  >
                    <div>
                      <label htmlFor="role" className={labelClass}>
                        Role
                      </label>
                      <select
                        id="role"
                        name="role"
                        value={role}
                        onChange={(event) =>
                          handleRoleChange(event.currentTarget.value)
                        }
                        className={inputClass}
                      >
                        {manageableRoles.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {selectedRole.description}
                      </p>
                    </div>

                    {isCountryRole ? (
                      <div>
                        <label htmlFor="country" className={labelClass}>
                          Country
                        </label>
                        <select
                          id="country"
                          name="country"
                          value={country}
                          onChange={(event) =>
                            setCountry(event.currentTarget.value)
                          }
                          required
                          className={inputClass}
                        >
                          <option value="">Choose a production country</option>
                          {result.countries.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label htmlFor="nest" className={labelClass}>
                            Production nest
                          </label>
                          <select
                            id="nest"
                            name="nest"
                            value={nestId}
                            onChange={(event) =>
                              setNestId(event.currentTarget.value)
                            }
                            required
                            className={inputClass}
                          >
                            <option value="">Choose a production nest</option>
                            {result.nests.map((nest) => (
                              <option key={nest.id} value={nest.id}>
                                {nest.code} · {nest.name}
                                {nest.country ? ` (${nest.country})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {role === "quartermaster" && (
                          <div>
                            <label htmlFor="team" className={labelClass}>
                              Quartermaster team
                            </label>
                            <select
                              id="team"
                              name="team"
                              value={team}
                              onChange={(event) =>
                                setTeam(event.currentTarget.value)
                              }
                              className={inputClass}
                            >
                              <option value="flight">Flight</option>
                              <option value="fulfilment">Fulfilment</option>
                              <option value="facilities">Facilities</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <label htmlFor="change-reason" className={labelClass}>
                        Reason for change
                      </label>
                      <textarea
                        id="change-reason"
                        name="reason"
                        value={reason}
                        onChange={(event) =>
                          setReason(event.currentTarget.value)
                        }
                        rows={3}
                        minLength={5}
                        maxLength={500}
                        required
                        autoComplete="off"
                        spellCheck={true}
                        placeholder="Enter the reason for this access change"
                        className="block w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] leading-6 text-slate-950 caret-violet-700 shadow-sm outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15"
                      />
                      <div className="mt-1 flex justify-between gap-3 text-xs">
                        <span className="text-slate-500">
                          This reason is recorded in the access log.
                        </span>
                        <span
                          className={
                            reason.length > 470
                              ? "font-semibold text-amber-700"
                              : "text-slate-400"
                          }
                        >
                          {reason.length}/500
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-800 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-900 focus:outline-none focus:ring-4 focus:ring-violet-600/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isSaving ? "Saving change…" : "Grant role"}
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <SectionTitle
                    eyebrow="Revoke access"
                    title="Remove application access"
                    description="Remove one role or disable this profile across the application."
                  />

                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-bold text-amber-950">
                        Removing a role affects that dashboard
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-900/80">
                        Use the Remove button beside a role above. Existing
                        scopes are shared across roles in the current database
                        model.
                      </p>
                    </div>

                    <label htmlFor="revoke-reason" className={labelClass}>
                      Reason for revocation
                    </label>
                    <textarea
                      id="revoke-reason"
                      name="revokeReason"
                      value={reason}
                      onChange={(event) =>
                        setReason(event.currentTarget.value)
                      }
                      rows={3}
                      minLength={5}
                      maxLength={500}
                      required
                      autoComplete="off"
                      placeholder="Enter the reason before revoking access"
                      className="block w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] leading-6 text-slate-950 caret-violet-700 shadow-sm outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15"
                    />

                    <button
                      type="button"
                      disabled={isSaving || !selectedUser.isActive}
                      onClick={() => applyAction("deactivate")}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-600/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4">
                        <path d="M4 7h16" />
                        <path d="M10 11v6m4-6v6" />
                        <path d="m6 7 1 14h10l1-14" />
                        <path d="M9 7V4h6v3" />
                      </Icon>
                      Revoke all application access
                    </button>

                    {!selectedUser.isActive && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => applyAction("reactivate")}
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-600/15 disabled:opacity-50"
                      >
                        Reactivate profile
                      </button>
                    )}

                    <p className="text-xs leading-5 text-slate-500">
                      Full revocation removes application roles and scopes and
                      keeps the Supabase Auth account.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <section className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-800">
                <Icon className="h-6 w-6">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4.5 4.5" />
                </Icon>
              </span>
              <h2 className="mt-4 font-bold text-slate-950">
                Choose a user to manage
              </h2>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Select an account from the search results to view its roles and
                change access.
              </p>
            </section>
          )}
        </section>
      )}
    </main>
  );
}