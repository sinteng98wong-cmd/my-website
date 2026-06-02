import { requirePermission } from "@/lib/rbac";
import { NewUserForm } from "./NewUserForm";

export default async function NewUserPage() {
  await requirePermission("users:manage");
  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <a href="/users" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Users
        </a>
        <h1 className="page-title mt-2">Add User</h1>
      </div>
      <NewUserForm />
    </div>
  );
}
