import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const role   = (session.user as any)?.role;
    const userId = (session.user as any)?.id;
    const body   = await req.json();
    const { action, reviewNote } = body; // action: "approve" | "reject" | "cancel"

    const leave = await prisma.staffLeave.findUnique({ where: { id: params.id } });
    if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only managers can approve/reject; staff can cancel own
    const isManager = ["SUPER_ADMIN","CLINIC_MANAGER"].includes(role);
    if ((action === "approve" || action === "reject") && !isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (action === "cancel" && leave.staffId !== userId && !isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const statusMap: Record<string, "APPROVED"|"REJECTED"|"CANCELLED"> = {
      approve: "APPROVED", reject: "REJECTED", cancel: "CANCELLED",
    };

    const updated = await prisma.staffLeave.update({
      where: { id: params.id },
      data: {
        status:      statusMap[action],
        reviewedById: isManager ? userId : undefined,
        reviewedAt:  isManager ? new Date() : undefined,
        reviewNote:  reviewNote || null,
      },
      include: {
        staff:      { select: { name: true, role: true } },
        clinic:     { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
