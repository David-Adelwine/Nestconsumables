import { redirect } from "next/navigation";
import { getUserContext, hasRole } from "@/lib/auth/get-user-context";
import UserManagementClient from "./user-management-client";

export default async function UserManagementPage() {
  const user = await getUserContext();

  if (!user?.hasApplicationAccess) redirect("/request-access");
  if (!hasRole(user, "it_admin")) redirect("/dashboard");

  return <UserManagementClient />;
}