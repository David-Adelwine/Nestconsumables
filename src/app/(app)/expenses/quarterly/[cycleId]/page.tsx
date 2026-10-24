import { QuarterlyExpenseWorkspace } from "@/components/expenses/QuarterlyExpenseWorkspace";

type ExpenseQuarterWorkspacePageProps = {
  params: Promise<{ cycleId: string }>;
};

export default async function ExpenseQuarterWorkspacePage({
  params,
}: ExpenseQuarterWorkspacePageProps) {
  const { cycleId } = await params;

  return (
    <QuarterlyExpenseWorkspace
      mode="planning"
      initialCycleId={cycleId}
      workspaceOnly
    />
  );
}
