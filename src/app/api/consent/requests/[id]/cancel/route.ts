import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const request = await prisma.consentRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status === "COMPLETED") {
    return NextResponse.json({ error: "Cannot cancel a completed consent" }, { status: 409 });
  }

  const updated = await prisma.consentRequest.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json(updated);
}
