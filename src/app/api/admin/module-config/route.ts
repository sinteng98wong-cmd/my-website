import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MODULES, CONFIGURABLE_ROLES, DEFAULT_ROLE_ACTIONS,
  type ModuleKey, type ConfigurableRole, type ActionKey,
} from "@/lib/modules";

function guard(role: unknown) {
  if (role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

function parseActions(raw: string | null | undefined): ActionKey[] {
  try { const p = JSON.parse(raw ?? "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
}

/** GET — returns the full role×module×actions matrix */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const g = guard((session?.user as any)?.role);
  if (g) return g;

  const configs = await prisma.roleModuleConfig.findMany();

  // grid: module → role → ActionKey[]
  const grid: Record<string, Record<string, ActionKey[]>> = {};
  for (const mod of MODULES) {
    grid[mod.key] = {};
    for (const role of CONFIGURABLE_ROLES) {
      const row = configs.find(c => c.module === mod.key && c.role === role);
      grid[mod.key][role] = row
        ? parseActions(row.actions)
        : (DEFAULT_ROLE_ACTIONS[role]?.[mod.key] ?? []) as ActionKey[];
    }
  }

  return NextResponse.json({ grid });
}

/** PUT — upsert a single role+module → actions[] */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const g = guard((session?.user as any)?.role);
  if (g) return g;

  try {
    const { role, module: mod, actions } = await req.json() as {
      role: string; module: string; actions: ActionKey[];
    };

    if (!CONFIGURABLE_ROLES.includes(role as ConfigurableRole) || !MODULES.find(m => m.key === mod)) {
      return NextResponse.json({ error: "Invalid role or module" }, { status: 422 });
    }
    if (!Array.isArray(actions)) {
      return NextResponse.json({ error: "actions must be an array" }, { status: 422 });
    }

    const updatedBy = (session!.user as any)?.id;
    await prisma.roleModuleConfig.upsert({
      where:  { role_module: { role, module: mod } },
      update: { actions: JSON.stringify(actions), updatedBy },
      create: { role, module: mod, actions: JSON.stringify(actions), updatedBy },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
