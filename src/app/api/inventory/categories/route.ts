import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const categories = await prisma.stockCategory.findMany({
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    include: {
      children: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
    where: { parentId: null }, // top-level only; children included above
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, parentId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 422 });

  const category = await prisma.stockCategory.create({
    data: { name: name.trim(), parentId: parentId || null },
  });

  return NextResponse.json(category, { status: 201 });
}
