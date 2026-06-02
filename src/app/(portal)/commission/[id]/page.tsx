import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LocumSlipActions } from "./LocumSlipActions";
import { AdjustSplitRate }  from "./AdjustSplitRate";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  DRAFT:    { badge: "badge-slate",   label: "Draft"    },
  APPROVED: { badge: "badge-blue",    label: "Approved" },
  LOCKED:   { badge: "badge-green",   label: "Locked"   },
  REVERSED: { badge: "badge-red",     label: "Reversed" },
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function SlipTable({ headers, children, footer }: {
  headers: string[]; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {headers.map((h, i) => (
              <th key={h} className={`px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${
                i === 0 ? "text-left" : "text-right"
              }`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">{children}</tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/60">{footer}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SumRow({ label, value, bold, accent, minus }: {
  label: string; value: string; bold?: boolean; accent?: boolean; minus?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center px-6 py-3 text-sm border-b border-slate-50 last:border-0 ${
      bold   ? "font-semibold"                     : ""
    } ${accent ? "bg-blue-50/60"                  : ""
    }`}>
      <span className={accent ? "text-blue-700" : minus ? "text-red-600" : "text-slate-600"}>
        {label}
      </span>
      <span className={`tabular-nums ${
        accent ? "text-blue-700 font-bold" : minus ? "text-red-600" : "text-slate-900"
      }`}>{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LocumSlipPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id  as string;

  const stmt = await (prisma as any).locumReconciliationStatement.findUnique({
    where:   { id: params.id },
    include: { doctor: { include: { user: { select: { name: true, email: true } } } } },
  });

  if (!stmt) notFound();
  if (role === "DOCTOR" && stmt.doctor.userId !== userId) notFound();

  const p          = stmt.payload as any;
  const canManage  = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const statusConf = STATUS_CONFIG[stmt.status] ?? STATUS_CONFIG.DRAFT;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back */}
      <Link
        href={`/commission?tab=doctor&month=${stmt.month}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        ← Back to Doctor Commission
      </Link>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/* Left */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={statusConf.badge}>{statusConf.label}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400">{stmt.month}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">Monthly Commission Statement</h1>
            <p className="text-sm text-slate-600">{stmt.doctor.user.name}</p>
            <p className="text-xs text-slate-400">{stmt.doctor.user.email}</p>
          </div>
          {/* Right — payout highlight */}
          <div className="text-right">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Net Payout</p>
            <p className="text-3xl font-bold text-green-700 tabular-nums mt-1">
              {RM(Number(stmt.finalPayout))}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-slate-400">Split rate: {Number(stmt.splitRate)}%</p>
              {canManage && (
                <AdjustSplitRate
                  id={stmt.id}
                  currentSplitRate={Number(stmt.splitRate)}
                  currentStatus={stmt.status}
                />
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <LocumSlipActions id={stmt.id} currentStatus={stmt.status} />
          </div>
        )}
      </div>

      {/* ── Daily Collection ────────────────────────────────────────────── */}
      {p.dailyCollections?.length > 0 && (
        <Section title="Daily Collection">
          <SlipTable
            headers={["Date", "Net Amount"]}
            footer={
              <>
                <td className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sub-total</td>
                <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">
                  {RM(Number(p.summary.grossCollectionTotal))}
                </td>
              </>
            }
          >
            {p.dailyCollections.map((d: any) => (
              <tr key={d.date} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-6 py-3 text-slate-700">{d.date}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-900">{RM(Number(d.amount))}</td>
              </tr>
            ))}
          </SlipTable>
        </Section>
      )}

      {/* ── Endodontic Cases ────────────────────────────────────────────── */}
      {p.endoCases?.length > 0 && (
        <Section title="Endodontic Cases">
          <SlipTable
            headers={["Patient", "Tooth", "Net Amount", `Split (${Number(stmt.splitRate)}%)`, "Collection"]}
            footer={
              <>
                <td colSpan={4} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sub-total (pre-split)</td>
                <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">{RM(Number(p.summary.endoTotal))}</td>
              </>
            }
          >
            {p.endoCases.map((c: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900">{c.patientName}</td>
                <td className="px-6 py-3 text-slate-500">{c.toothCodes || "—"}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.amount))}</td>
                <td className="px-6 py-3 text-right text-slate-400">{Number(c.splitRate)}%</td>
                <td className="px-6 py-3 text-right tabular-nums font-medium text-slate-900">{RM(Number(c.collection))}</td>
              </tr>
            ))}
          </SlipTable>
        </Section>
      )}

      {/* ── Denture / Bridge / Crown ─────────────────────────────────────── */}
      {p.dentureBridgeCrownCases?.length > 0 && (
        <Section title="Denture / Bridge / Crown">
          <SlipTable
            headers={["Patient", "Charge", "Lab Fee", "Net", `Split (${Number(stmt.splitRate)}%)`, "Collection"]}
            footer={
              <>
                <td colSpan={5} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sub-total (pre-split)</td>
                <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">{RM(Number(p.summary.dentureBridgeCrownTotal))}</td>
              </>
            }
          >
            {p.dentureBridgeCrownCases.map((c: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900">{c.patientName}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.charge))}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-400">{RM(Number(c.labFee))}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.netAmount))}</td>
                <td className="px-6 py-3 text-right text-slate-400">{Number(c.splitRate)}%</td>
                <td className="px-6 py-3 text-right tabular-nums font-medium text-slate-900">{RM(Number(c.collection))}</td>
              </tr>
            ))}
          </SlipTable>
        </Section>
      )}

      {/* ── Aligner Cases ────────────────────────────────────────────────── */}
      {p.alignerCases?.length > 0 && (
        <Section title="Aligner / Orthodontic Cases — Collection Based">
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-700">
              Commission is calculated on <strong>actual collected amount</strong>, not the full billed amount.
            </p>
          </div>
          <SlipTable
            headers={["Patient", "Total Billed", "Collected", "Lab Fees", "Balance", "Paid (Prior)", "Commission"]}
            footer={
              <>
                <td colSpan={6} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sub-total (collection-adjusted balance)</td>
                <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">{RM(Number(p.summary.alignerTotal))}</td>
              </>
            }
          >
            {p.alignerCases.map((c: any, i: number) => {
              const pct = c.totalTreatment > 0
                ? Math.round((Number(c.balance) + Number(c.labFees)) / Number(c.totalTreatment) * 100)
                : 0;
              return (
                <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">{c.patientName}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-400 line-through">{RM(Number(c.totalTreatment))}</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-medium text-slate-900">{RM(Number(c.balance) + Number(c.labFees))}</span>
                      <div className="w-16 bg-slate-200 rounded-full h-1">
                        <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-400">{RM(Number(c.labFees))}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.balance))}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-400">{RM(Number(c.paidLocum))}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-medium text-slate-900">{RM(Number(c.collection))}</td>
                </tr>
              );
            })}
          </SlipTable>
        </Section>
      )}

      {/* ── Pending Lab Cases ────────────────────────────────────────────── */}
      {p.pendingLabCases?.length > 0 && (
        <Section title="Pending Lab Cases — Commission Deferred">
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-100">
            <p className="text-xs text-amber-700">
              These cases have active lab jobs. Commission will be included once the lab work is <strong>Fitted</strong>.
            </p>
          </div>
          <SlipTable
            headers={["Patient", "Type", "Lab Status", "Billed", "Lab Fee", "Net (on fitting)", "Projected Comm"]}
          >
            {p.pendingLabCases.map((c: any, i: number) => {
              const statusColor: Record<string, string> = {
                ORDERED:      "badge-slate",
                SENT_TO_LAB:  "badge-blue",
                RECEIVED:     "badge-amber",
              };
              return (
                <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">{c.patientName}</td>
                  <td className="px-6 py-3 text-slate-600">{c.typeCode}</td>
                  <td className="px-6 py-3">
                    <span className={statusColor[c.labJobStatus] ?? "badge-slate"}>
                      {c.labJobStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.billedAmount))}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-400">{RM(Number(c.labFee))}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-700">{RM(Number(c.netAmount))}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-amber-700 font-medium">{RM(Number(c.projectedComm))}</td>
                </tr>
              );
            })}
          </SlipTable>
        </Section>
      )}

      {/* ── Reconciliation Summary ───────────────────────────────────────── */}
      <Section title="Reconciliation Summary">
        <div className="divide-y divide-slate-50">
          <SumRow label="Standard Collections"            value={RM(Number(p.summary.grossCollectionTotal))} />
          <SumRow label="Endodontic Cases (net)"          value={RM(Number(p.summary.endoTotal))} />
          <SumRow label="Denture / Bridge / Crown (net)"  value={RM(Number(p.summary.dentureBridgeCrownTotal))} />
          <SumRow label="Aligner Cases (balance)"         value={RM(Number(p.summary.alignerTotal))} />
          <SumRow label="Grand Sub-total (pre-split)"     value={RM(Number(p.summary.grandSubTotal))} bold />
          <SumRow
            label={`Professional Fee Payout × ${Number(stmt.splitRate)}%`}
            value={RM(Number(p.summary.professionalFeePayout))}
            bold accent
          />

          {p.summary.ancillaries?.map((a: any) => (
            <SumRow key={a.key} label={`+ ${a.label}`} value={RM(Number(a.amount))} />
          ))}
          {Number(p.summary.ancillaryTotal) > 0 && (
            <SumRow label="Ancillary Total" value={`+ ${RM(Number(p.summary.ancillaryTotal))}`} bold />
          )}

          {p.summary.deductions?.map((d: any, i: number) => (
            <SumRow
              key={i}
              label={`− ${d.description}${d.patientName ? ` (${d.patientName})` : ""}`}
              value={`(${RM(Number(d.amount))})`}
              minus
            />
          ))}
          {Number(p.summary.deductionTotal) > 0 && (
            <SumRow label="Total Deductions" value={`(${RM(Number(p.summary.deductionTotal))})`} bold minus />
          )}

          {/* Net payout */}
          <div className="flex justify-between items-center px-6 py-5 bg-gradient-to-r from-green-50 to-emerald-50 border-t-2 border-green-200">
            <span className="font-bold text-slate-800 text-base">NET PAYOUT</span>
            <span className="text-3xl font-bold text-green-700 tabular-nums">
              {RM(Number(p.summary.finalPayout))}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}
