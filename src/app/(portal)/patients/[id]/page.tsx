import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notDeleted, ACTIVE } from "@/lib/soft-delete";
import { requirePermission } from "@/lib/rbac";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DentalChart } from "@/components/DentalChart";
import { MCSection } from "@/components/MCSection";
import { WalkInButton } from "./WalkInButton";
import { DepositBalanceBadge } from "@/components/DepositBalanceBadge";
import { PatientDepositTab } from "@/components/PatientDepositTab";
import { getDepositBalance } from "@/lib/deposit";

// re-used in two places below
type InvPayment = { method: string; amount: any; panelProvider?: { name: string } | null };
function InvoiceBar({ inv }: {
  inv: { id: string; invoiceRef: string; sst: any; total: any; collectedAt: Date | null; payments: InvPayment[] };
}) {
  const METHOD_LABELS: Record<string, string> = {
    CASH_CURRENT: "Cash", CASH_NEXT: "Cash (Next)", CREDIT_CARD: "Card",
    FPX: "FPX", EWALLET: "eWallet", ATOME: "Atome", PANEL: "Panel",
  };
  function fmt(n: number | string) {
    return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
  }
  const methodLabel = inv.payments.length === 1
    ? (inv.payments[0].method === "PANEL" && inv.payments[0].panelProvider
        ? `Panel — ${inv.payments[0].panelProvider.name}`
        : METHOD_LABELS[inv.payments[0].method] ?? inv.payments[0].method)
    : `${inv.payments.length} methods`;
  return (
    <div className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-md px-4 py-2.5">
      <div className="flex items-center gap-4 text-slate-500">
        <Link href={`/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline">
          {inv.invoiceRef}
        </Link>
        <span>{methodLabel}</span>
        {Number(inv.sst) > 0 && <span>SST: {fmt(inv.sst)}</span>}
        {inv.collectedAt && (
          <span>Collected {new Date(inv.collectedAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-900 text-sm">{fmt(inv.total)}</span>
        <Link href={`/invoices/${inv.id}`} className="btn-ghost text-xs py-1 px-2">View →</Link>
      </div>
    </div>
  );
}

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}
const STATUS_CLASS: Record<string, string> = {
  DRAFT: "badge-slate", PENDING_LOCK: "badge-amber", LOCKED: "badge-green", REVERSED: "badge-red",
};
const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash", CASH_NEXT: "Cash (Next)", CREDIT_CARD: "Card",
  FPX: "FPX", EWALLET: "eWallet", ATOME: "Atome", PANEL: "Panel",
};

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  await requirePermission("patient:manage");
  const session  = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role as string ?? "";
  const canRefund = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(userRole);
  const tab = searchParams.tab ?? "visits";

  const [patient, clinics] = await Promise.all([
    prisma.patient.findUnique({
      where: notDeleted({ id: params.id }),
      include: {
        homeClinic: true,
        source: { select: { name: true } },
        referredByPatient: { select: { id: true, name: true } },
        referredByDoctor:  { select: { name: true } },
        referredByClinic:  { select: { name: true } },
        visits: {
          where: ACTIVE,
          orderBy: { visitDate: "desc" },
          include: {
            treatments: {
              include: {
                treatmentType: true,
                doctor: { include: { user: { select: { name: true } } } },
                commissions: { select: { finalPayout: true, status: true } },
              },
            },
            invoices: {
              where: ACTIVE,
              include: { payments: { include: { panelProvider: { select: { name: true } } } } },
            },
          },
        },
      },
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!patient) notFound();

  const patientAge = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const REFERRAL_LABEL: Record<string, string> = {
    PATIENT: "Patient", INTERNAL_DOCTOR: "Doctor", INTERNAL_CLINIC: "Clinic", EXTERNAL: "External",
  };
  let referralDisplay: { text: string; link?: string } | null = null;
  if (patient.referralType === "PATIENT" && patient.referredByPatient) {
    referralDisplay = { text: patient.referredByPatient.name, link: `/patients/${patient.referredByPatient.id}` };
  } else if (patient.referralType === "INTERNAL_DOCTOR" && patient.referredByDoctor) {
    referralDisplay = { text: `${patient.referredByDoctor.name} (Doctor)` };
  } else if (patient.referralType === "INTERNAL_CLINIC" && patient.referredByClinic) {
    referralDisplay = { text: `${patient.referredByClinic.name} (Clinic)` };
  } else if (patient.referralType === "EXTERNAL" && patient.externalReferrerName) {
    referralDisplay = { text: `${patient.externalReferrerName} (${patient.externalReferrerType ?? "external"})` };
  }

  const addressParts = [patient.address, patient.city, patient.postcode, patient.state].filter(Boolean);

  const totalBilled    = patient.visits.flatMap((v) => v.treatments).reduce((s, t) => s + Number(t.billedAmount), 0);
  const totalCollected = patient.visits.flatMap((v) => v.invoices).reduce((s, i) => s + (i.collectedAt ? Number(i.total) : 0), 0);
  const outstanding    = totalBilled - totalCollected;

  const TABS = [
    { key: "visits",  label: "Visit History" },
    { key: "chart",   label: "Dental Chart" },
    { key: "mc",      label: "Medical Certificate" },
    { key: "deposit", label: "Deposit / Wallet" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/patients" className="text-sm text-slate-500 hover:text-slate-700">← Patients</Link>
          <h1 className="page-title mt-2">{patient.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-xs text-slate-400">{patient.patientRef}</span>
            <span className={patient.isForeigner ? "badge-amber" : "badge-green"}>
              {patient.isForeigner ? "Foreign" : "Local"}
            </span>
            {patient.status === "PENDING" && <span className="badge-amber">Pending Registration</span>}
            {patient.source && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{patient.source.name}</span>}
            {patientAge !== null && <span className="text-xs text-slate-500">{patientAge} years old</span>}
            <DepositBalanceBadge patientId={patient.id} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <Link href={`/patients/${patient.id}/edit`} className="btn-outline text-sm">
            Edit
          </Link>
          <Link
            href={`/appointments?patientId=${patient.id}`}
            className="btn-outline text-sm"
          >
            Book Appointment
          </Link>
          <WalkInButton patientId={patient.id} clinicId={patient.homeClinicId} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Visits</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{patient.visits.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Billed</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{fmt(totalBilled)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</p>
          <p className={`text-2xl font-semibold mt-1 ${outstanding > 0 ? "text-amber-600" : "text-slate-900"}`}>
            {fmt(outstanding)}
          </p>
        </div>
        <Link href={`/patients/${patient.id}?tab=deposit`} className="stat-card hover:bg-blue-50 transition-colors">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Deposit Balance</p>
          <DepositBalanceServer patientId={patient.id} />
        </Link>
      </div>

      {/* Info + last visit */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Patient Info</h2>
          <dl className="space-y-3">
            {[
              { label: "Home Clinic",  value: patient.homeClinic.name },
              { label: patient.isForeigner ? "Passport" : "IC Number", value: patient.icNumber ?? patient.passportNo ?? "—" },
              { label: "Date of Birth", value: patient.dateOfBirth ? `${new Date(patient.dateOfBirth).toLocaleDateString("en-MY", { dateStyle: "medium" })}${patientAge !== null ? ` (${patientAge}y)` : ""}` : "—" },
              { label: "Gender", value: patient.gender ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : "—" },
              { label: "Phone",  value: patient.phone ?? "—" },
              { label: "Email",  value: patient.email ?? "—" },
              { label: "Address", value: addressParts.length ? addressParts.join(", ") : "—" },
              { label: "Registered", value: new Date(patient.createdAt).toLocaleDateString("en-MY", { dateStyle: "medium" }) },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-slate-500">{row.label}</dt>
                <dd className="text-sm text-slate-900 mt-0.5">{row.value}</dd>
              </div>
            ))}
            {referralDisplay && (
              <div>
                <dt className="text-xs text-slate-500">Referred by ({REFERRAL_LABEL[patient.referralType!] ?? "—"})</dt>
                <dd className="text-sm text-slate-900 mt-0.5">
                  {referralDisplay.link
                    ? <Link href={referralDisplay.link} className="text-blue-600 hover:underline">{referralDisplay.text}</Link>
                    : referralDisplay.text}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="col-span-2 card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Last Visit</h2>
          {patient.visits.length === 0 ? (
            <p className="text-sm text-slate-400">No visits yet</p>
          ) : (() => {
            const last = patient.visits[0];
            const inv  = last.invoices[0];
            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-900">
                    {new Date(last.visitDate).toLocaleDateString("en-MY", { dateStyle: "long" })}
                  </span>
                  {inv && (
                    <span className={inv.collectedAt ? "badge-green" : "badge-amber"}>
                      {inv.collectedAt ? "Paid" : "Pending payment"}
                    </span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-100">
                      <th className="text-left py-1.5">Treatment</th>
                      <th className="text-left py-1.5">Doctor</th>
                      <th className="text-right py-1.5">Billed</th>
                      <th className="text-right py-1.5">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.treatments.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50">
                        <td className="py-2 text-slate-900">{t.treatmentType.name}</td>
                        <td className="py-2 text-slate-500">{t.doctor?.user.name ?? "—"}</td>
                        <td className="py-2 text-right">{fmt(Number(t.billedAmount))}</td>
                        <td className="py-2 text-right">{fmt(Number(t.collectedAmount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {inv && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <InvoiceBar inv={inv} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tabbed sections */}
      <div className="card">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/patients/${params.id}?tab=${t.key}`}
              className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div className="p-5">
          {/* ── Visit History ── */}
          {tab === "visits" && (
            patient.visits.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No visits recorded</p>
            ) : (
              <div className="divide-y divide-slate-100 -mx-5">
                {patient.visits.map((visit) => {
                  const inv        = visit.invoices[0];
                  const visitTotal = visit.treatments.reduce((s, t) => s + Number(t.billedAmount), 0);
                  return (
                    <div key={visit.id} className="px-5 py-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-900">
                            {new Date(visit.visitDate).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                          </span>
                          <span className="font-mono text-xs text-slate-400">{visit.visitRef}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{fmt(visitTotal)}</span>
                          {inv ? (
                            <span className={inv.collectedAt ? "badge-green" : "badge-amber"}>
                              {inv.collectedAt ? "Paid" : "Pending"}
                            </span>
                          ) : <span className="badge-slate">No invoice</span>}
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-md overflow-hidden mb-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Treatment</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Doctor</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Billed</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Collected</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Commission</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visit.treatments.map((t) => (
                              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                                <td className="px-4 py-2.5 text-slate-900">
                                  <Link href={`/visits/${visit.id}`} className="text-blue-700 hover:underline">
                                    {t.treatmentType.name}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">{t.doctor?.user.name ?? "—"}</td>
                                <td className="px-4 py-2.5 text-right">{fmt(Number(t.billedAmount))}</td>
                                <td className="px-4 py-2.5 text-right">{fmt(Number(t.collectedAmount))}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {t.commissions[0] ? (
                                    <Link
                                      href={`/commission?month=${new Date(visit.visitDate).toISOString().slice(0, 7)}&treatmentId=${t.id}`}
                                      className="inline-flex items-center justify-end gap-1.5 hover:opacity-80"
                                    >
                                      <span>{fmt(Number(t.commissions[0].finalPayout))}</span>
                                      <span className={STATUS_CLASS[t.commissions[0].status] ?? "badge-slate"}>
                                        {t.commissions[0].status}
                                      </span>
                                    </Link>
                                  ) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {inv && (
                        <div className="space-y-2">
                          <InvoiceBar inv={inv} />
                          {/* Quick link to invoice for treatment failure refund */}
                          {inv.collectedAt && canRefund && (
                            <Link
                              href={`/invoices/${inv.id}#refund`}
                              className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:underline"
                            >
                              ↩ Treatment Failure Refund
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── Dental Chart ── */}
          {tab === "chart" && <DentalChart patientId={params.id} />}

          {/* ── Medical Certificate ── */}
          {tab === "mc" && <MCSection patientId={params.id} clinics={clinics} />}

          {/* ── Deposit / Wallet ── */}
          {tab === "deposit" && (
            <PatientDepositTab
              patientId={params.id}
              clinicId={patient.homeClinicId}
              clinics={clinics}
              canRefund={canRefund}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Server component — renders the deposit balance inline in the stat card. */
async function DepositBalanceServer({ patientId }: { patientId: string }) {
  const balance = await getDepositBalance(patientId);
  const RM = (n: number) =>
    new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
  return (
    <p className={`text-2xl font-semibold mt-1 ${balance > 0 ? "text-green-700" : "text-slate-400"}`}>
      {RM(balance)}
    </p>
  );
}
