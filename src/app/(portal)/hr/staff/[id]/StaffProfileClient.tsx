"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d?: string | Date | null) => d ? new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" }) : "—";
const RM = (n: number | string) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

function yearsMonths(from?: Date | string | null): string {
  if (!from) return "";
  const start = new Date(from); const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  return `${years > 0 ? years + "y " : ""}${months}m`;
}

function initials(name: string) { return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2); }

function Avatar({ name, size = "lg" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-20 h-20 text-2xl" : size === "md" ? "w-12 h-12 text-base" : "w-8 h-8 text-xs";
  const colors = ["bg-blue-500","bg-green-500","bg-purple-500","bg-rose-500","bg-amber-500","bg-teal-500"];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>{initials(name)}</div>;
}

const STATUS_CLASS: Record<string, string> = { ACTIVE:"bg-green-100 text-green-700", PROBATION:"bg-amber-100 text-amber-700", SUSPENDED:"bg-red-100 text-red-700", RESIGNED:"bg-slate-100 text-slate-500", TERMINATED:"bg-slate-100 text-slate-500" };
const SCORE_COLOR = (s: number) => s >= 90 ? "text-green-700" : s >= 75 ? "text-blue-700" : s >= 50 ? "text-amber-700" : "text-red-700";

const TABS = ["Overview","Leave","Attendance","Payroll","Claims","KPI","Appraisals","Disciplinary","Training","Documents"];

// ── Main component ────────────────────────────────────────────────────────────
export function StaffProfileClient({ id, userId, isManager, isSuperAdmin }: { id: string; userId: string; isManager: boolean; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState("Overview");
  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ action: "", reason: "", resignationDate: "", lastWorkingDate: "", exitReason: "" });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function loadProfile() {
    const d = await fetch(`/api/hr/staff/${id}`).then(r => r.json()).catch(() => null);
    setProfile(d);
  }
  useEffect(() => { loadProfile(); }, [id]);

  async function doAction() {
    setActionBusy(true); setActionError("");
    const res = await fetch(`/api/hr/staff/${id}/employment-action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actionForm),
    });
    const d = await res.json();
    setActionBusy(false);
    if (!res.ok) { setActionError(d.error); return; }
    setActionOpen(false);
    loadProfile();
  }

  if (!profile) return <div className="p-8 text-slate-400 text-center">Loading staff profile…</div>;

  const status = profile.employmentStatus as string;
  const today = new Date();
  const confirmDate = profile.confirmationDate ? new Date(profile.confirmationDate) : null;
  const daysToConfirm = confirmDate ? Math.ceil((confirmDate.getTime() - today.getTime()) / 86400000) : null;
  const dob = profile.dateOfBirth ? new Date(profile.dateOfBirth) : null;
  const daysToBirthday = dob ? (() => {
    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    return Math.ceil((next.getTime() - today.getTime()) / 86400000);
  })() : null;

  const visibleTabs = TABS.filter(t => t !== "Disciplinary" || isManager);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Back */}
      <button onClick={() => router.push("/hr/staff")} className="text-sm text-slate-500 hover:text-slate-700">← Staff Directory</button>

      {/* Header */}
      <div className="card p-5 flex flex-col md:flex-row gap-5">
        <Avatar name={profile.user?.name ?? "?"} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{profile.user?.name}</h1>
              <p className="text-slate-500 text-sm">{profile.employeeId ?? "No ID"} · {profile.user?.role} · {profile.jobTitle}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{profile.employmentType?.replace("_"," ")}</span>
                {profile.user?.userClinics?.map((uc: any) => (
                  <span key={uc.clinicId} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{uc.clinic?.name}</span>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Joined {fmt(profile.joinDate)} · {yearsMonths(profile.joinDate)} service</p>
            </div>
            <div className="flex gap-2 items-start">
              <button onClick={() => router.push(`/hr/leave/apply?staffProfileId=${id}`)} className="btn-secondary text-xs">Apply Leave</button>
              <button onClick={() => router.push(`/hr/claims/new?staffProfileId=${id}`)} className="btn-secondary text-xs">New Claim</button>
              {isManager && (
                <div className="relative">
                  <button onClick={() => setActionOpen(v => !v)} className="btn-primary text-xs">Employment Actions ▾</button>
                  {actionOpen && (
                    <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded shadow-lg z-20 w-52 py-1">
                      {[
                        status === "PROBATION" && { key: "CONFIRM", label: "Confirm Employment" },
                        !["SUSPENDED","RESIGNED","TERMINATED"].includes(status) && { key: "SUSPEND", label: "Suspend Staff" },
                        status === "SUSPENDED" && { key: "REINSTATE", label: "Reinstate Staff" },
                        !["RESIGNED","TERMINATED"].includes(status) && { key: "RESIGN", label: "Record Resignation" },
                        isSuperAdmin && !["TERMINATED"].includes(status) && { key: "TERMINATE", label: "Terminate Employment" },
                      ].filter(Boolean).map((a: any) => (
                        <button key={a.key} onClick={() => { setActionForm(f => ({ ...f, action: a.key, reason: "" })); setActionOpen(false); setActionError(""); }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">{a.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alert banners */}
      <div className="space-y-2">
        {status === "SUSPENDED" && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">🔴 This staff member is currently <strong>suspended</strong>.</div>}
        {daysToConfirm !== null && daysToConfirm >= 0 && daysToConfirm <= 30 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">⚠ Probation ends on <strong>{fmt(profile.confirmationDate)}</strong> ({daysToConfirm} days). Please confirm or extend employment.</div>
        )}
        {daysToBirthday !== null && daysToBirthday <= 7 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">🎂 Birthday in <strong>{daysToBirthday} day{daysToBirthday !== 1 ? "s" : ""}</strong>!</div>
        )}
      </div>

      {/* Employment action dialog */}
      {actionForm.action && (
        <div className="card p-5 space-y-3 border-2 border-blue-200">
          <h2 className="font-semibold text-slate-800">{actionForm.action.replace("_"," ")}</h2>
          {["SUSPEND","TERMINATE"].includes(actionForm.action) && (
            <div><label className="form-label">Reason *</label><textarea rows={3} className="form-input" value={actionForm.reason} onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))} /></div>
          )}
          {actionForm.action === "RESIGN" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Resignation Date *</label><input type="date" className="form-input" value={actionForm.resignationDate} onChange={e => setActionForm(f => ({ ...f, resignationDate: e.target.value }))} /></div>
                <div><label className="form-label">Last Working Date</label><input type="date" className="form-input" value={actionForm.lastWorkingDate} onChange={e => setActionForm(f => ({ ...f, lastWorkingDate: e.target.value }))} /></div>
              </div>
              <div><label className="form-label">Exit Reason</label>
                <select className="form-input" value={actionForm.exitReason} onChange={e => setActionForm(f => ({ ...f, exitReason: e.target.value }))}>
                  {["","Better opportunity","Personal reasons","Relocation","Retirement","Health reasons","Other"].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </>
          )}
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-2">
            <button onClick={doAction} disabled={actionBusy} className="btn-primary text-sm">{actionBusy ? "Processing…" : "Confirm"}</button>
            <button onClick={() => setActionForm(f => ({ ...f, action: "" }))} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "Overview" && <OverviewTab profile={profile} isManager={isManager} />}
      {tab === "Leave" && <LeaveTab staffProfileId={id} isManager={isManager} />}
      {tab === "Attendance" && <AttendanceTab staffProfileId={id} isManager={isManager} />}
      {tab === "Payroll" && <PayrollTab staffProfileId={id} isManager={isManager} />}
      {tab === "Claims" && <ClaimsTab staffProfileId={id} isManager={isManager} />}
      {tab === "KPI" && <KpiTab staffProfileId={id} isManager={isManager} />}
      {tab === "Appraisals" && <AppraisalsTab staffProfileId={id} isManager={isManager} />}
      {tab === "Disciplinary" && isManager && <DisciplinaryTab staffProfileId={id} isSuperAdmin={isSuperAdmin} />}
      {tab === "Training" && <TrainingTab staffProfileId={id} isManager={isManager} />}
      {tab === "Documents" && <DocumentsTab staffProfileId={id} isManager={isManager} />}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ profile, isManager }: { profile: any; isManager: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Left */}
      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Personal Information</h3>
          <dl className="space-y-2 text-sm">
            {[
              ["IC No", profile.icNo], ["Passport", profile.passportNo],
              ["DOB", profile.dateOfBirth ? `${new Date(profile.dateOfBirth).toLocaleDateString("en-MY")} (Age ${Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31557600000)})` : null],
              ["Gender", profile.gender], ["Phone", profile.phone], ["Email", profile.user?.email],
              ["Address", [profile.address, profile.city, profile.state, profile.postcode].filter(Boolean).join(", ")],
            ].map(([label, val]) => val && (
              <div key={label as string} className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">{label}:</span><span className="font-medium">{val}</span></div>
            ))}
          </dl>
          {(profile.emergencyName) && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-slate-400 mb-1">Emergency Contact</p>
              <p className="text-sm font-medium">{profile.emergencyName} ({profile.emergencyRelation})</p>
              <p className="text-sm text-slate-500">{profile.emergencyPhone}</p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Employment</h3>
          <dl className="space-y-2 text-sm">
            {[
              ["Employee ID", profile.employeeId], ["Job Title", profile.jobTitle],
              ["Department", profile.department], ["Type", profile.employmentType?.replace("_"," ")],
              ["Status", profile.employmentStatus], ["Join Date", profile.joinDate ? new Date(profile.joinDate).toLocaleDateString("en-MY") : null],
              ["Confirmation", profile.confirmationDate ? new Date(profile.confirmationDate).toLocaleDateString("en-MY") : null],
            ].map(([label, val]) => val && (
              <div key={label as string} className="flex gap-2"><span className="text-slate-400 w-28 flex-shrink-0">{label}:</span><span className="font-medium">{val}</span></div>
            ))}
          </dl>
        </div>

        {isManager && profile.basicSalary && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Payroll Info</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-slate-400 w-28">Basic Salary:</span><span className="font-medium">{RM(profile.basicSalary)}</span></div>
              {profile.bankName && <div className="flex gap-2"><span className="text-slate-400 w-28">Bank:</span><span>{profile.bankName}</span></div>}
              {profile.bankAccountNo && <div className="flex gap-2"><span className="text-slate-400 w-28">Account:</span><span className="font-mono">{"*".repeat(Math.max(0, profile.bankAccountNo.length - 4))}{profile.bankAccountNo.slice(-4)}</span></div>}
              {profile.epfNo && <div className="flex gap-2"><span className="text-slate-400 w-28">EPF No:</span><span className="font-mono">{profile.epfNo}</span></div>}
            </dl>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="space-y-4">
        {profile.leaveBalances?.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Leave Balances {new Date().getFullYear()}</h3>
            <div className="space-y-2">
              {profile.leaveBalances.filter((lb: any) => Number(lb.entitled) > 0).map((lb: any) => {
                const taken = Number(lb.taken); const entitled = Number(lb.entitled) + Number(lb.carriedOver);
                const pct = entitled > 0 ? Math.round((taken / entitled) * 100) : 0;
                return (
                  <div key={lb.id}>
                    <div className="flex justify-between text-xs text-slate-600 mb-0.5"><span>{lb.leaveType}</span><span>{taken}/{entitled} days used</span></div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {profile._count && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Activity Summary</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "KPIs", val: profile._count.kpis, href: "KPI" },
                { label: "Appraisals", val: profile._count.appraisals, href: "Appraisals" },
                { label: "Trainings", val: profile._count.trainings, href: "Training" },
              ].map(({ label, val, href }) => (
                <div key={label} className="text-center p-3 bg-slate-50 rounded cursor-pointer hover:bg-blue-50" onClick={() => {}}>
                  <p className="text-xl font-bold text-slate-800">{val}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wider">Clinic Assignments</h3>
          {profile.user?.userClinics?.length > 0 ? (
            <div className="space-y-2">
              {profile.user.userClinics.map((uc: any) => (
                <div key={uc.clinicId} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{uc.clinic?.name}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{uc.roleOverride ?? profile.user.role}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No clinic assignments.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Leave Tab ─────────────────────────────────────────────────────────────────
function LeaveTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/leave?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setLeaves(Array.isArray(d) ? d : []));
    fetch(`/api/hr/leave-balances?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setBalances(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balances.filter(b => Number(b.entitled) > 0).map(b => (
          <div key={b.id} className="card p-3">
            <p className="text-xs text-slate-400">{b.leaveType}</p>
            <p className="text-lg font-bold text-slate-800">{b.balance}<span className="text-xs text-slate-400 ml-1">/ {b.entitled}</span></p>
            <p className="text-xs text-slate-400">{b.taken} taken</p>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Ref","Type","Dates","Days","Status"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {leaves.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No leave records.</td></tr>}
            {leaves.map(l => (
              <tr key={l.id} className="border-t border-slate-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{l.leaveRef}</td>
                <td className="px-4 py-2">{l.leaveType}</td>
                <td className="px-4 py-2 text-slate-500">{fmt(l.startDate)} – {fmt(l.endDate)}</td>
                <td className="px-4 py-2">{l.totalDays}d</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{PENDING:"bg-amber-100 text-amber-700",APPROVED:"bg-green-100 text-green-700",REJECTED:"bg-red-100 text-red-700",CANCELLED:"bg-slate-100 text-slate-400",WITHDRAWN:"bg-slate-100 text-slate-400"}[l.status as "PENDING"|"APPROVED"|"REJECTED"|"CANCELLED"|"WITHDRAWN"]}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Attendance Tab ────────────────────────────────────────────────────────────
function AttendanceTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/attendance?staffProfileId=${staffProfileId}&month=${month}`).then(r => r.json()).then(d => setRecords(Array.isArray(d) ? d : []));
  }, [staffProfileId, month]);

  const counts = { present: 0, absent: 0, late: 0, leave: 0, ph: 0, ot: 0 };
  for (const r of records) {
    if (["PRESENT","LATE"].includes(r.status)) counts.present++;
    if (r.status === "ABSENT") counts.absent++;
    if (r.status === "LATE") counts.late++;
    if (r.status === "ON_LEAVE") counts.leave++;
    if (r.status === "PUBLIC_HOLIDAY") counts.ph++;
    counts.ot += r.overtimeMinutes ?? 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input type="month" className="form-input text-sm w-40" value={month} onChange={e => setMonth(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[["Present",counts.present,"text-green-700"],["Absent",counts.absent,"text-red-700"],["Late",counts.late,"text-amber-700"],["On Leave",counts.leave,"text-blue-700"],["PH",counts.ph,"text-slate-500"],["OT (hrs)",(counts.ot/60).toFixed(1),"text-purple-700"]].map(([l,v,c]) => (
          <div key={l as string} className="card p-3 text-center"><p className={`text-xl font-bold ${c}`}>{v}</p><p className="text-xs text-slate-400">{l}</p></div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Date","Day","Status","Check In","Check Out","Late","OT"].map(h => <th key={h} className="px-3 py-2 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No attendance records for this month.</td></tr>}
            {records.map(r => (
              <tr key={r.id} className="border-t border-slate-50">
                <td className="px-3 py-2">{new Date(r.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}</td>
                <td className="px-3 py-2 text-slate-400">{new Date(r.date).toLocaleDateString("en-MY", { weekday: "short" })}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{PRESENT:"bg-green-100 text-green-700",ABSENT:"bg-red-100 text-red-700",LATE:"bg-amber-100 text-amber-700",HALF_DAY:"bg-orange-100 text-orange-700",ON_LEAVE:"bg-blue-100 text-blue-700",PUBLIC_HOLIDAY:"bg-purple-100 text-purple-700",OFF_DAY:"bg-slate-100 text-slate-500"}[r.status as "PRESENT"|"ABSENT"|"LATE"|"HALF_DAY"|"ON_LEAVE"|"PUBLIC_HOLIDAY"|"OFF_DAY"] ?? "bg-slate-100 text-slate-500"}`}>{r.status?.replace("_"," ")}</span></td>
                <td className="px-3 py-2 text-xs font-mono">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-3 py-2 text-xs font-mono">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-3 py-2 text-xs">{r.lateMinutes ? `${r.lateMinutes}m` : "—"}</td>
                <td className="px-3 py-2 text-xs">{r.overtimeMinutes ? `${r.overtimeMinutes}m` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payroll Tab ───────────────────────────────────────────────────────────────
function PayrollTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const [slips, setSlips] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/hr/payroll/my-slips?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setSlips(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Month","Gross","Deductions","Net","Status",""].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {slips.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No payslips found.</td></tr>}
            {slips.map((s: any) => (
              <tr key={s.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setSelected(s)}>
                <td className="px-4 py-2 font-medium">{s.payrollRun?.month}</td>
                <td className="px-4 py-2">{RM(s.grossSalary)}</td>
                <td className="px-4 py-2 text-red-600">{RM(Number(s.epfEmployee) + Number(s.socsoEmployee) + Number(s.incomeTax))}</td>
                <td className="px-4 py-2 font-bold text-green-700">{RM(s.netSalary)}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{DRAFT:"bg-slate-100 text-slate-500",LOCKED:"bg-blue-100 text-blue-700",PAID:"bg-green-100 text-green-700"}[s.payrollRun?.status as "DRAFT"|"LOCKED"|"PAID"] ?? ""}`}>{s.payrollRun?.status}</span></td>
                <td className="px-4 py-2 text-blue-600 text-xs">Details →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="card p-5 space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold text-slate-800">Payslip — {selected.payrollRun?.month}</h3><button onClick={() => setSelected(null)} className="text-xs text-slate-400">Close</button></div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[["Basic Salary", RM(selected.basicSalary)],["Allowances", RM(selected.allowances)],["Commission", RM(selected.commission)],["Gross", RM(selected.grossSalary)],["EPF (Employee)", RM(selected.epfEmployee)],["SOCSO", RM(selected.socsoEmployee)],["EIS", RM(selected.eisEmployee)],["Income Tax", RM(selected.incomeTax)],["Net Salary", RM(selected.netSalary)]].map(([l,v]) => (
              <div key={l} className="flex justify-between"><span className="text-slate-400">{l}</span><span className="font-medium">{v}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Claims Tab ────────────────────────────────────────────────────────────────
function ClaimsTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const [claims, setClaims] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/claims?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setClaims(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="table-header"><tr>{["Ref","Type","Amount","Date","Status"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {claims.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No claims found.</td></tr>}
          {claims.map((c: any) => (
            <tr key={c.id} className="border-t border-slate-50">
              <td className="px-4 py-2 font-mono text-xs text-slate-400">{c.claimRef}</td>
              <td className="px-4 py-2">{c.claimType}</td>
              <td className="px-4 py-2 font-medium">{RM(c.amount)}</td>
              <td className="px-4 py-2 text-slate-400">{fmt(c.claimDate)}</td>
              <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{DRAFT:"bg-slate-100 text-slate-500",SUBMITTED:"bg-amber-100 text-amber-700",APPROVED:"bg-blue-100 text-blue-700",PAID:"bg-green-100 text-green-700",REJECTED:"bg-red-100 text-red-700"}[c.status as "DRAFT"|"SUBMITTED"|"APPROVED"|"PAID"|"REJECTED"] ?? ""}`}>{c.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── KPI Tab ───────────────────────────────────────────────────────────────────
function KpiTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const router = useRouter();
  const [kpis, setKpis] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/kpi?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setKpis(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  return (
    <div className="space-y-4">
      {isManager && <div className="flex justify-end"><button onClick={() => router.push(`/hr/kpi?assign=1&staffProfileId=${staffProfileId}`)} className="btn-primary text-sm">Assign KPI</button></div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Period","Template","Score","Status",""].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {kpis.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No KPI records.</td></tr>}
            {kpis.map(k => (
              <tr key={k.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/hr/kpi/${k.id}`)}>
                <td className="px-4 py-2 font-medium">{k.period}</td>
                <td className="px-4 py-2 text-slate-500">{k.template?.name}</td>
                <td className="px-4 py-2">{k.overallScore != null ? <span className={`font-bold ${SCORE_COLOR(Number(k.overallScore))}`}>{Number(k.overallScore).toFixed(1)}%</span> : "—"}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{DRAFT:"bg-slate-100 text-slate-500",ACTIVE:"bg-blue-100 text-blue-700",COMPLETED:"bg-purple-100 text-purple-700",ARCHIVED:"bg-slate-100 text-slate-400"}[k.status as "DRAFT"|"ACTIVE"|"COMPLETED"|"ARCHIVED"] ?? ""}`}>{k.status}</span></td>
                <td className="px-4 py-2 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Appraisals Tab ────────────────────────────────────────────────────────────
function AppraisalsTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const router = useRouter();
  const [appraisals, setAppraisals] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/appraisals?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setAppraisals(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  return (
    <div className="space-y-4">
      {isManager && <div className="flex justify-end"><button onClick={() => router.push(`/hr/appraisals?new=1&staffProfileId=${staffProfileId}`)} className="btn-primary text-sm">New Appraisal</button></div>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Ref","Period","Reviewer","Self","Manager","Final","Status",""].map(h => <th key={h} className="px-3 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {appraisals.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No appraisals.</td></tr>}
            {appraisals.map(a => (
              <tr key={a.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/hr/appraisals/${a.id}`)}>
                <td className="px-3 py-2 text-xs font-mono text-slate-400">{a.appraisalRef}</td>
                <td className="px-3 py-2 font-medium">{a.period}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{a.reviewer?.name}</td>
                <td className="px-3 py-2 text-center">{a.selfRating ?? "—"}</td>
                <td className="px-3 py-2 text-center">{a.managerRating ?? "—"}</td>
                <td className="px-3 py-2 text-center font-bold">{a.finalRating ?? "—"}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{DRAFT:"bg-slate-100 text-slate-500",SELF_REVIEW:"bg-amber-100 text-amber-700",MANAGER_REVIEW:"bg-blue-100 text-blue-700",COMPLETED:"bg-purple-100 text-purple-700",ACKNOWLEDGED:"bg-green-100 text-green-700"}[a.status as "DRAFT"|"SELF_REVIEW"|"MANAGER_REVIEW"|"COMPLETED"|"ACKNOWLEDGED"] ?? ""}`}>{a.status?.replace("_"," ")}</span></td>
                <td className="px-3 py-2 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Disciplinary Tab ──────────────────────────────────────────────────────────
function DisciplinaryTab({ staffProfileId, isSuperAdmin }: { staffProfileId: string; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/disciplinary?staffProfileId=${staffProfileId}`).then(r => r.json()).then(d => setRecords(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  const openCount = records.filter(r => r.status === "OPEN").length;

  return (
    <div className="space-y-4">
      {openCount > 0 && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">🔴 {openCount} open disciplinary record{openCount !== 1 ? "s" : ""}</div>}
      <div className="flex justify-end"><button onClick={() => router.push(`/hr/disciplinary?new=1&staffProfileId=${staffProfileId}`)} className="btn-primary text-sm">New Record</button></div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Ref","Type","Incident Date","Status","Confidential",""].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No disciplinary records.</td></tr>}
            {records.map(r => (
              <tr key={r.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/hr/disciplinary/${r.id}`)}>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.discRef}</td>
                <td className="px-4 py-2">{r.type?.replace("_"," ")}</td>
                <td className="px-4 py-2 text-slate-500">{fmt(r.incidentDate)}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{OPEN:"bg-red-100 text-red-700",RESPONDED:"bg-amber-100 text-amber-700",RESOLVED:"bg-green-100 text-green-700",CLOSED:"bg-slate-100 text-slate-400"}[r.status as "OPEN"|"RESPONDED"|"RESOLVED"|"CLOSED"] ?? ""}`}>{r.status}</span></td>
                <td className="px-4 py-2 text-center">{r.isConfidential ? "🔒" : ""}</td>
                <td className="px-4 py-2 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Training Tab ──────────────────────────────────────────────────────────────
function TrainingTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const router = useRouter();
  const [trainings, setTrainings] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/hr/training/staff/${staffProfileId}`).then(r => r.json()).then(d => setTrainings(Array.isArray(d) ? d : []));
  }, [staffProfileId]);

  const counts = { COMPLETED: 0, ONGOING: 0, PLANNED: 0 };
  for (const t of trainings) counts[t.status as keyof typeof counts] = (counts[t.status as keyof typeof counts] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[["Completed",counts.COMPLETED,"text-green-700"],["Ongoing",counts.ONGOING,"text-amber-700"],["Planned",counts.PLANNED,"text-blue-700"]].map(([l,v,c]) => (
          <div key={l as string} className="card p-3 text-center"><p className={`text-xl font-bold ${c}`}>{v}</p><p className="text-xs text-slate-400">{l}</p></div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Title","Provider","Dates","Status","Score","Certificate"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {trainings.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No training records.</td></tr>}
            {trainings.map(t => (
              <tr key={t.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/hr/training/${t.trainingId}`)}>
                <td className="px-4 py-2 font-medium">{t.training?.title}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">{t.training?.provider ?? "—"}</td>
                <td className="px-4 py-2 text-slate-400 text-xs">{fmt(t.training?.startDate)}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{PLANNED:"bg-blue-100 text-blue-700",ONGOING:"bg-amber-100 text-amber-700",COMPLETED:"bg-green-100 text-green-700",CANCELLED:"bg-slate-100 text-slate-400"}[t.status as "PLANNED"|"ONGOING"|"COMPLETED"|"CANCELLED"] ?? ""}`}>{t.status}</span></td>
                <td className="px-4 py-2">{t.score ?? "—"}</td>
                <td className="px-4 py-2">{t.certificateUrl ? <a href={t.certificateUrl} target="_blank" onClick={e => e.stopPropagation()} className="text-blue-600 text-xs hover:underline">Download</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ staffProfileId, isManager }: { staffProfileId: string; isManager: boolean }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ title: "", category: "Identity", fileUrl: "", expiryDate: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    fetch(`/api/hr/staff/${staffProfileId}/documents`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, [staffProfileId]);

  async function upload() {
    setBusy(true);
    const res = await fetch(`/api/hr/staff/${staffProfileId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (res.ok) { setShowUpload(false); setForm({ title: "", category: "Identity", fileUrl: "", expiryDate: "" }); load(); }
  }

  async function del(docId: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/hr/staff/${staffProfileId}/documents/${docId}`, { method: "DELETE" });
    load();
  }

  const today = new Date();
  const byCategory: Record<string, any[]> = {};
  for (const d of docs) {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d);
  }

  return (
    <div className="space-y-4">
      {isManager && (
        <div className="flex justify-end">
          <button onClick={() => setShowUpload(v => !v)} className="btn-primary text-sm">Upload Document</button>
        </div>
      )}

      {showUpload && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-slate-800">Upload Document</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Title *</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="form-label">Category</label>
              <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {["Identity","Contract","Certificate","Medical","Other"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="form-label">File URL *</label><input className="form-input" value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))} placeholder="https://…" /></div>
            <div><label className="form-label">Expiry Date</label><input type="date" className="form-input" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={upload} disabled={busy || !form.title || !form.fileUrl} className="btn-primary text-sm">{busy ? "Uploading…" : "Upload"}</button>
            <button onClick={() => setShowUpload(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {Object.keys(byCategory).length === 0 && <div className="card p-8 text-center text-slate-400">No documents uploaded yet.</div>}

      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat} className="card overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100"><p className="text-xs font-semibold text-slate-500 uppercase">{cat}</p></div>
          <div className="divide-y divide-slate-50">
            {items.map(doc => {
              const expired = doc.expiryDate && new Date(doc.expiryDate) < today;
              const expiringSoon = doc.expiryDate && !expired && (new Date(doc.expiryDate).getTime() - today.getTime()) < 30 * 86400000;
              return (
                <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{doc.title}</p>
                    <p className="text-xs text-slate-400">Uploaded {fmt(doc.createdAt)} by {doc.uploadedBy?.name ?? "system"}</p>
                    {doc.expiryDate && <p className={`text-xs mt-0.5 ${expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-slate-400"}`}>{expired ? "🔴 Expired:" : expiringSoon ? "⚠ Expires:" : "Expires:"} {fmt(doc.expiryDate)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <a href={doc.fileUrl} target="_blank" className="text-xs text-blue-600 hover:underline">Download</a>
                    {isManager && <button onClick={() => del(doc.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
