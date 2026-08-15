import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess } from "@/lib/clinic-access";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const doc = await prisma.openingBalance.findUnique({
    where: { id: params.id },
    include: {
      clinic:      { select: { id: true, name: true } },
      createdBy:   { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      reviewedBy:  { select: { id: true, name: true } },
      lines: {
        include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
        orderBy: { item: { name: "asc" } },
      },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json(doc);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const doc = await prisma.openingBalance.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Only an unposted draft can be discarded; approved documents are history.
  if (doc.status !== "DRAFT" && doc.status !== "REJECTED")
    return NextResponse.json({ error: `Cannot delete a ${doc.status} opening balance` }, { status: 409 });

  await prisma.openingBalance.delete({ where: { id: doc.id } });
  return NextResponse.json({ ok: true });
}
