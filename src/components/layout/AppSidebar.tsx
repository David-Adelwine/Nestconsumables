"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  {
    label: "Dashboard selector",
    href: "/dashboard",
    icon: "▦",
  },
  {
    label: "Finance",
    href: "/finance/dashboard",
    icon: "$",
  },
  {
    label: "Nest Lead",
    href: "/lead/dashboard",
    icon: "⌖",
  },
  {
    label: "Procurement",
    href: "/procurement",
    icon: "↗",
  },
  {
    label: "Quartermaster",
    href: "/quartermaster/dashboard",
    icon: "□",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`flex min-h-screen shrink-0 flex-col border-r border-gray-200 bg-white py-6 transition-[width] duration-200 ${
        isCollapsed ? "w-20 px-2" : "w-64 px-4"
      }`}
    >
      <div
        className={`mb-10 flex ${
          isCollapsed
            ? "flex-col items-center gap-3"
            : "items-center justify-between gap-3"
        }`}
      >
        <Link
          href="/dashboard"
          aria-label="Nest Consumables dashboard"
          className={`flex items-center gap-3 ${
            isCollapsed ? "justify-center" : "px-2"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">
            N
          </span>

          {!isCollapsed && (
            <span>
              <span className="block text-base font-bold text-gray-900">
                Nest
              </span>
              <span className="block text-[10px] font-semibold tracking-[0.18em] text-gray-500">
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <span aria-hidden="true">{isCollapsed ? "»" : "«"}</span>
        </button>
      </div>

      {!isCollapsed && (
        <p className="mb-3 px-3 text-xs font-semibold tracking-wider text-gray-400">
          WORKSPACE
        </p>
      )}

      <nav
        id="main-navigation"
        aria-label="Main navigation"
        className="flex flex-col gap-1"
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
              className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition ${
                isCollapsed
                  ? "justify-center px-2"
                  : "gap-3 px-3"
              } ${
                isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span
                className="w-5 shrink-0 text-center text-base"
                aria-hidden="true"
              >
                {item.icon}
              </span>

              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        {isCollapsed ? (
          <div
            title="Contact your system administrator for help"
            aria-label="Help: Contact your system administrator"
            className="flex h-10 items-center justify-center rounded-xl bg-gray-50 text-sm font-semibold text-gray-600"
          >
            ?
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800">Need help?</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Contact your system administrator if you need help using the
              application.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}