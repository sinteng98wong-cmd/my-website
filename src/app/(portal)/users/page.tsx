import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { UserCard } from "./UserCard";

export default async function UsersPage() {
  await requirePermission("users:manage");

  const [users, clinics] = await Promise.all([
    prisma.user.findMany({
      include: {
        userClinics: {
          include: { clinic: { select: { id: true, name: true } } },
          orderBy: { clinic: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.clinic.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} accounts</p>
        </div>
        <a href="/users/new" className="btn-primary">
          Add User
        </a>
      </div>

      <div className="space-y-4">
        {users.map((u) => (
          <UserCard
            key={u.id}
            user={{
              id:       u.id,
              name:     u.name,
              email:    u.email,
              role:     u.role,
              active:   u.active,
              userClinics: u.userClinics.map((uc) => ({
                clinicId:     uc.clinicId,
                clinicName:   uc.clinic.name,
                roleOverride: uc.roleOverride ?? null,
              })),
            }}
            allClinics={clinics}
          />
        ))}
      </div>
    </div>
  );
}
