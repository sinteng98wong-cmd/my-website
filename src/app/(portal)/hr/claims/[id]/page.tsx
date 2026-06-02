import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

const RM = (n: any) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

export default async function ClaimDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const claim = await prisma.staffClaim.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { userId: true, user: { select: { name: true } } } }, reviewedBy: { select: { name: true } } },
  });
  if (!claim) notFound();
  const isManager = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  if (!isManager && claim.staffProfile.userId !== userId) redirect("/hr/claims");

  const steps = ["DRAFT", "SUBMITTED", "APPROVED", "PAID"];
  const idx = claim.status === "REJECTED" ? -1 : steps.indexOf(claim.status);

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/hr/claims" className="text-sm text-slate-500 hover:text-slate-700">← Claims</Link>

      <div className="card p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold">{RM(claim.amount)}</h1>
            <p className="text-sm text-slate-500">{claim.claimType} · {claim.staffProfile.user.name}</p>
            <p className="font-mono text-xs text-slate-400 mt-1">{claim.claimRef}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${claim.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{claim.status}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div><p className="text-xs text-slate-400">Receipt Date</p><p>{format(new Date(claim.receiptDate), "d MMM yyyy")}</p></div>
          <div><p className="text-xs text-slate-400">Submitted</p><p>{claim.submittedAt ? format(new Date(claim.submittedAt), "d MMM yyyy") : "—"}</p></div>
          <div className="col-span-2"><p className="text-xs text-slate-400">Description</p><p>{claim.description}</p></div>
        </div>
        {claim.receiptUrl && <a href={claim.receiptUrl} target="_blank" className="text-blue-600 text-sm hover:underline mt-3 inline-block">View receipt</a>}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Status</h2>
        {claim.status === "REJECTED" ? (
          <p className="text-sm text-red-600">Rejected. Reason: {claim.reviewNote ?? "—"}</p>
        ) : (
          <div className="flex items-center">
            {steps.map((s, i) => (
              <div key={s} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i <= idx ? "bg-blue-600" : "bg-slate-300"}`} />
                  <span className={`text-xs mt-1 ${i <= idx ? "text-blue-700" : "text-slate-400"}`}>{s}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < idx ? "bg-blue-500" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-xs text-slate-500 space-y-1">
          {claim.reviewedBy && <p>Reviewed by {claim.reviewedBy.name}{claim.reviewNote ? ` — ${claim.reviewNote}` : ""}</p>}
          {claim.paidAt && <p>Paid {format(new Date(claim.paidAt), "d MMM yyyy")}{claim.paymentRef ? ` · Ref: ${claim.paymentRef}` : ""}</p>}
        </div>
      </div>
    </div>
  );
}
