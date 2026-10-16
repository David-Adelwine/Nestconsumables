"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationIconName =
  | "dashboard"
  | "finance"
  | "lead"
  | "procurement"
  | "quartermaster";

const navigationItems: {
  label: string;
  href: string;
  icon: NavigationIconName;
}[] = [
  {
    label: "Dashboard selector",
    href: "/dashboard",
    icon: "dashboard",
  },
  {
    label: "Finance",
    href: "/finance/dashboard",
    icon: "finance",
  },
  {
    label: "Nest Lead",
    href: "/lead/dashboard",
    icon: "lead",
  },
  {
    label: "Procurement",
    href: "/procurement",
    icon: "procurement",
  },
  {
    label: "Quartermaster",
    href: "/quartermaster/dashboard",
    icon: "quartermaster",
  },
];

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    finance: (
      <>
        <path d="M12 3.5v17" />
        <path d="M16.5 7.5c0-1.7-1.9-3-4.5-3s-4.5 1.3-4.5 3 1.8 2.8 4.5 3.2 4.5 1.4 4.5 3.2-1.9 3.1-4.5 3.1-4.5-1.3-4.5-3.1" />
      </>
    ),
    lead: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h1" />
        <path d="M16.5 13.5v7m-3.5-3.5h7" />
      </>
    ),
    procurement: (
      <>
        <path d="M4 5.5h16l-1.4 8.2a2 2 0 0 1-2 1.7H8a2 2 0 0 1-2-1.7L4 5.5Z" />
        <path d="M4 5.5 3 3.5H1.5" />
        <circle cx="9" cy="19" r="1.25" />
        <circle cx="16" cy="19" r="1.25" />
      </>
    ),
    quartermaster: (
      <>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.5V21" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`flex min-h-screen shrink-0 flex-col border-r border-slate-200 bg-white py-6 transition-[width,padding] duration-200 ${
        isCollapsed ? "w-20 px-2.5" : "w-64 px-4"
      }`}
    >
      <div
        className={`mb-9 flex ${
          isCollapsed
            ? "flex-col items-center gap-3"
            : "items-center justify-between gap-3"
        }`}
      >
        <Link
          href="/dashboard"
          aria-label="Nest Consumables dashboard"
          className={`flex items-center gap-3 ${
            isCollapsed ? "justify-center" : "min-w-0 px-2"
          }`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-700 to-violet-900 text-lg font-bold text-white shadow-md shadow-violet-900/15">
            N
          </span>

          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-950">
                Nest
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-bold tracking-[0.16em] text-violet-800">
                CONSUMABLES
              </span>
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!isCollapsed}
          aria-controls="main-navigation"
          title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-600/15"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12.5 4.5-5 5.5 5 5.5" />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Workspace
        </p>
      )}

      <nav
        id="main-navigation"
        aria-label="Main navigation"
        className="flex flex-col gap-1.5"
      >
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={isCollapsed ? item.label : undefined}
              className={`group relative flex min-h-11 items-center rounded-xl text-sm font-semibold transition ${
                isCollapsed
                  ? "justify-center px-2"
                  : "gap-3 px-3"
              } ${
                isActive
                  ? "bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-200/80"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {isActive && (
                <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-violet-700" />
              )}

              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                  isActive
                    ? "bg-violet-100 text-violet-800"
                    : "text-slate-500 group-hover:bg-white group-hover:text-violet-800"
                }`}
              >
                <NavigationIcon name={item.icon} />
              </span>

              {!isCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        {isCollapsed ? (
          <div
            title="Contact your system administrator for help"
            aria-label="Help: Contact your system administrator"
            className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600"
          >
            ?
          </div>
        ) : (
          <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-violet-800 shadow-sm ring-1 ring-violet-100">
              ?
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">Need help?</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Contact your system administrator if you need help using the
              application.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}