import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [moduleConfigs, clinicConfigs] = await Promise.all([
      prisma.roleModuleConfig.findMany(),
      prisma.roleClinicConfig.findMany({ include: { clinic: { select: { name: true } } } }),
    ]);

    return NextResponse.json({ moduleConfigs, clinicConfigs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId  = (session?.user as any)?.id;
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { type, role, key, enabled } = body;
    // type: "module" | "clinic"
    // key: moduleKey or clinicId

    if (type === "module") {
      // Module config now uses actions array, not boolean enabled.
      // This route is kept for clinic-level config; module actions go via /api/admin/module-config.
      const actions = JSON.stringify(enabled ? ["view"] : []);
      await prisma.roleModuleConfig.upsert({
        where: { role_module: { role, module: key } },
        update: { actions, updatedBy: userId },
        create: { role, module: key, actions, updatedBy: userId },
      });
    } else if (type === "clinic") {
      await prisma.roleClinicConfig.upsert({
        where: { role_clinicId: { role, clinicId: key } },
        update: { enabled },
        create: { role, clinicId: key, enabled },
      });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
