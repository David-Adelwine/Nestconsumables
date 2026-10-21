import Link from "next/link";
import { QuarterlyExpenseWorkspace } from "@/components/expenses/QuarterlyExpenseWorkspace";

export default function QuarterlyExpensesFinancePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav aria-label="Finance dashboard views" className="flex flex-wrap gap-2">
        <Link
          href="/finance/dashboard"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-violet-300 hover:text-violet-800"
        >
          Consumables costs
        </Link>
        <Link
          href="/finance/quarterly-expenses"
          aria-current="page"
          className="rounded-xl bg-violet-100 px-4 py-2.5 text-sm font-bold text-violet-900"
        >
          Quarterly expenses
        </Link>
      </nav>

      <QuarterlyExpenseWorkspace mode="finance" />
    </div>
  );
}