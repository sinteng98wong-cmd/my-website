/**
 * Role-Based Access Control
 * Middleware helper for Next.js API routes & Server Actions
 */

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type Permission =
  | "clinic:all"              // Super Admin only
  | "clinic:own"              // Clinic Manager — own clinic
  | "commission:lock"         // Finance, Super Admin
  | "commission:sign"         // Doctor — sign own daily/monthly statement
  | "commission:cm-approve"   // Clinic Manager — first-level approval
  | "commission:view:own"     // Doctor — own commission only
  | "commission:view:all"     // Finance, Clinic Manager, Super Admin
  | "staff:manage"         // Clinic Manager
  | "schedule:manage"      // Clinic Manager
  | "schedule:view"        // All roles
  | "patient:manage"       // Doctor, Receptionist, Clinic Manager
  | "invoice:manage"       // Receptionist, Clinic Manager
  | "stock:manage"         // Storekeeper, HQ
  | "do:manage"            // Storekeeper
  | "pool:manage"          // Storekeeper, Clinic Manager
  | "ledger:view"          // Finance, Clinic Manager
  | "ledger:full"          // Finance only
  | "users:manage"         // Super Admin
  | "config:manage"        // Finance, Super Admin
  | "admin:manage";        // Super Admin only — deleted records, restore

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    "clinic:all", "commission:lock", "commission:view:all",
    "staff:manage", "schedule:manage", "schedule:view",
    "patient:manage", "invoice:manage", "stock:manage",
    "do:manage", "pool:manage", "ledger:full", "ledger:view",
    "users:manage", "config:manage", "admin:manage",
  ],
  FINANCE: [
    "clinic:all", "commission:view:all", "ledger:full", "ledger:view",
    "config:manage", "schedule:view",
  ],
  CLINIC_MANAGER: [
    "clinic:own", "commission:lock", "commission:cm-approve", "commission:view:all",
    "staff:manage", "schedule:manage", "schedule:view",
    "patient:manage", "invoice:manage", "pool:manage",
    "ledger:view",
  ],
  DOCTOR: [
    "commission:view:own", "commission:sign", "schedule:view", "patient:manage",
  ],
  NURSE: [
    "schedule:view", "patient:manage",
  ],
  RECEPTIONIST: [
    "schedule:view", "patient:manage", "invoice:manage",
  ],
  STOREKEEPER: [
    "stock:manage", "do:manage", "pool:manage",
  ],
};

export async function requirePermission(permission: Permission) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthenticated");

  const role = (session.user as any).role as string;
  const perms = ROLE_PERMISSIONS[role] ?? [];

  if (!perms.includes(permission)) {
    throw new Error(`Forbidden: role ${role} lacks permission ${permission}`);
  }
  return session;
}

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
