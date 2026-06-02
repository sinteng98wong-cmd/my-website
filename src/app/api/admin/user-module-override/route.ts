import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModuleAccess } from "@/lib/module-access";
import type { ActionKey } from "@/lib/modules";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp       = new URL(req.url).searchParams;
    const userId   = sp.get("userId");
    const clinicId = sp.get("clinicId");
    if (!userId || !clinicId) {
      return NextResponse.json({ error: "userId and clinicId required" }, { status: 422 });
    }

    const [access, userClinic, user] = await Promise.all([
      getModuleAccess(userId, clinicId),
      prisma.userClinic.findUnique({
        where:  { userId_clinicId: { userId, clinicId } },
        select: { roleOverride: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } }),
    ]);

    const overrideCount = Object.values(access).filter(v => v.overrideActions !== null).length;
    return NextResponse.json({
      access,
      overrideCount,
      userRole:         user?.role,
      isRoleOverridden: !!userClinic?.roleOverride,
    });
  } catch (err: any) {
    console.error("[user-module-override GET]", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, clinicId, module: mod, actions } = await req.json() as {
      userId: string; clinicId: string; module: string; actions: ActionKey[] | null;
    };
    if (!userId || !clinicId || !mod) {
      return NextResponse.json({ error: "userId, clinicId, module required" }, { status: 422 });
    }

    if (actions === null) {
      // Reset: remove the override entirely
      await prisma.userClinicModule.deleteMany({ where: { userId, clinicId, module: mod } });
    } else {
      await prisma.userClinicModule.upsert({
        where:  { userId_clinicId_module: { userId, clinicId, module: mod } },
        update: { actions: JSON.stringify(actions) },
        create: { userId, clinicId, module: mod, actions: JSON.stringify(actions) },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[user-module-override PUT]", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
