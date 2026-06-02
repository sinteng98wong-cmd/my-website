import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — returns the list of clinicIds a user is assigned to */
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const links = await prisma.userClinic.findMany({
    where:  { userId: params.userId },
    select: { clinicId: true },
  });

  return NextResponse.json(links.map((l) => l.clinicId));
}
