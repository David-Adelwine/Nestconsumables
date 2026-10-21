import Link from "next/link";
import { QuarterlyExpenseWorkspace } from "@/components/expenses/QuarterlyExpenseWorkspace";

export default function QuarterlyExpensesFinancePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav aria-label="Finance dashboard views" className="flex flex-wrap gap-2">
        <Link
          href="/finance/dashboard"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-800"
        >
          Consumables costs
        </Link>
        <Link
          href="/finance/dashboard/quarterly-expenses"
          aria-current="page"
          className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900"
        >
          Quarterly expenses
        </Link>
      </nav>
      <QuarterlyExpenseWorkspace mode="finance" />
    </div>
  );
}