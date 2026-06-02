import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailDisciplinaryResponded } from "@/lib/hr-email";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const record = await prisma.disciplinary.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { userId: true, user: { select: { name: true } } } } },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.staffProfile.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (record.status !== "OPEN") return NextResponse.json({ error: "Can only respond to OPEN records" }, { status: 422 });

  const { staffResponse } = await req.json() as { staffResponse: string };
  if (!staffResponse) return NextResponse.json({ error: "staffResponse is required" }, { status: 422 });

  const updated = await prisma.disciplinary.update({ where: { id: params.id }, data: { staffResponse, status: "RESPONDED" } });
  emailDisciplinaryResponded(record.clinicId, record.staffProfile.user.name ?? "Staff", record.type).catch(console.error);
  return NextResponse.json(updated);
}
