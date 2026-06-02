import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isSuperAdmin(session: any) {
  return (session?.user as any)?.role === "SUPER_ADMIN";
}

/** PATCH — update a source. Cannot deactivate while patients use it. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    name?: string; description?: string; isActive?: boolean; order?: number;
  };

  // Block deactivation if in use
  if (body.isActive === false) {
    const count = await prisma.patient.count({ where: { sourceId: params.id, deletedAt: null } });
    if (count > 0) {
      return NextResponse.json(
        { error: `${count} patient${count === 1 ? "" : "s"} use this source. Reassign them before deactivating.`, count },
        { status: 400 }
      );
    }
  }

  const data: Record<string, any> = {};
  if (body.name        !== undefined) data.name        = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.isActive    !== undefined) data.isActive    = body.isActive;
  if (body.order       !== undefined) data.order       = body.order;

  const source = await prisma.patientSource.update({ where: { id: params.id }, data });
  return NextResponse.json(source);
}

/** DELETE — hard delete only if no patients use it. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.patient.count({ where: { sourceId: params.id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `${count} patients use this source. Deactivate instead of deleting.`, count },
      { status: 400 }
    );
  }

  await prisma.patientSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
