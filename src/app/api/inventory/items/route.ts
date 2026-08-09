import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES } from "@/lib/clinic-access";

// The item master has no clinic dimension — it is shared across the group —
// so this is role-gated only.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.stockItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true, sku: true, name: true, category: true, unit: true,
      categoryId: true,
      stockCategory: { select: { id: true, name: true, parentId: true, parent: { select: { name: true } } } },
      supplierId: true,
      supplier: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!INVENTORY_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { sku, name, category, categoryId, supplierId, unit } = body;
  if (!sku?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "sku and name are required" }, { status: 422 });
  }

  const item = await prisma.stockItem.create({
    data: {
      sku:        sku.trim(),
      name:       name.trim(),
      category:   category?.trim() || "Uncategorised",
      categoryId: categoryId || null,
      supplierId: supplierId || null,
      unit:       unit?.trim() || "unit",
    },
  });

  return NextResponse.json(item, { status: 201 });
}
