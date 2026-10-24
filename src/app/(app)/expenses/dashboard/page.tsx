import { QuarterlyExpenseWorkspace } from "@/components/expenses/QuarterlyExpenseWorkspace";

type ExpensePlanningPageProps = {
  searchParams: Promise<{ country?: string }>;
};

export default async function ExpensePlanningPage({
  searchParams,
}: ExpensePlanningPageProps) {
  const { country = "" } = await searchParams;

  return <QuarterlyExpenseWorkspace mode="planning" initialCountry={country} />;
}
