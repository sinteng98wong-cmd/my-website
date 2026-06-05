import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const request = await prisma.consentRequest.findUnique({
    where: { id: params.id },
    include: {
      template: { include: { fields: { orderBy: { order: "asc" } } } },
      patient: { select: { name: true, patientRef: true, phone: true } },
      clinic: { select: { name: true } },
      sentBy: { select: { name: true } },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(request);
}
