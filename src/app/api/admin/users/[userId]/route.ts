import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isSuperAdmin(session: any) {
  return (session?.user as any)?.role === "SUPER_ADMIN";
}

/** GET — single user detail */
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true, name: true, email: true,
      role: true, active: true, createdAt: true,
      userClinics: {
        select: {
          clinicId: true, roleOverride: true,
          clinic: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

/** PATCH — update name, email, role, active status, or password */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string; email?: string; role?: string;
    active?: boolean; password?: string;
  };

  // Prevent editing own account role/active to avoid lockout
  const selfId = (session?.user as any)?.id;
  if (selfId === params.userId && (body.role !== undefined || body.active === false)) {
    return NextResponse.json(
      { error: "Cannot change your own role or deactivate yourself" },
      { status: 422 }
    );
  }

  if (body.email) {
    const clash = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase().trim(), NOT: { id: params.userId } },
    });
    if (clash) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const data: Record<string, any> = {};
  if (body.name     !== undefined) data.name   = body.name.trim();
  if (body.email    !== undefined) data.email  = body.email.toLowerCase().trim();
  if (body.role     !== undefined) data.role   = body.role;
  if (body.active   !== undefined) data.active = body.active;
  if (body.password)               data.passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.update({
    where: { id: params.userId },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json(user);
}

/** DELETE — permanently delete a user (only if no clinical records attached) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const selfId = (session?.user as any)?.id;
  if (selfId === params.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 422 });
  }

  // Check for any clinical records that would block hard delete
  const [appts, leaves, ledger] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: params.userId } }),
    prisma.staffLeave.count({ where: { userId: params.userId } }),
    prisma.dailyLedger.count({ where: { editedById: params.userId } }),
  ]);

  if (appts + leaves + ledger > 0) {
    // Soft-delete: deactivate only
    await prisma.user.update({
      where: { id: params.userId },
      data:  { active: false },
    });
    return NextResponse.json({ deactivated: true, reason: "User has clinical records; deactivated instead of deleted" });
  }

  // Hard delete: remove clinic assignments first
  await prisma.userClinic.deleteMany({ where: { userId: params.userId } });
  await prisma.user.delete({ where: { id: params.userId } });
  return NextResponse.json({ deleted: true });
}
