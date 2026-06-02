import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const leave = await prisma.leaveApplication.findUnique({
    where: { id: params.id },
    include: {
      staffProfile: { select: { id: true, jobTitle: true, user: { select: { name: true, role: true, email: true } } } },
      clinic: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      coverRequests: {
        include: {
          requestedStaff: { select: { user: { select: { name: true } } } },
          offeredByStaff: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(leave);
}
