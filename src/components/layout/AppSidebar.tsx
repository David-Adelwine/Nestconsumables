"use client";

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

  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
      <Link href="/dashboard" className="mb-10 flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">
          N
        </span>

        <span>
          <span className="block text-base font-bold text-gray-900">Nest</span>
          <span className="block text-[10px] font-semibold tracking-[0.18em] text-gray-500">
            CONSUMABLES
          </span>
        </span>
      </Link>

      <p className="mb-3 px-3 text-xs font-semibold tracking-wider text-gray-400">
        WORKSPACE
      </p>

      <nav aria-label="Main navigation" className="flex flex-col gap-1">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="w-5 text-center text-base" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-800">Need help?</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          Contact your system administrator if you need help using the
          application.
        </p>
      </div>
    </aside>
  );
}