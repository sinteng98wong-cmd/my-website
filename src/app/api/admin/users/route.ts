import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isSuperAdmin(session: any) {
  return (session?.user as any)?.role === "SUPER_ADMIN";
}

/** GET — list all users */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true,
      role: true, active: true, createdAt: true,
      userClinics: {
        select: {
          clinicId: true,
          roleOverride: true,
          clinic: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

/** POST — create a new user */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role } = body as {
    name: string; email: string; password: string; role: string;
  };

  if (!name?.trim() || !email?.trim() || !password || !role) {
    return NextResponse.json({ error: "name, email, password and role are required" }, { status: 422 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      passwordHash,
      role:         role as any,
      active:       true,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
