"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const MY_STATES = [
  "Johor","Kedah","Kelantan","Melaka","Negeri Sembilan","Pahang",
  "Perak","Perlis","Pulau Pinang","Sabah","Sarawak","Selangor",
  "Terengganu","Kuala Lumpur","Labuan","Putrajaya",
];

const TABS = ["Company Info","Financial Settings","SST","e-Invoice","Branches","Bank & PV Settings"] as const;
type Tab = typeof TABS[number];

interface Clinic {
  id: string;
  name: string;
  isHQ: boolean;
  slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  directorId: string | null;
  picId: string | null;
  director: { id: string; name: string } | null;
  pic:      { id: string; name: string } | null;
  bankName:        string | null;
  bankAccountNo:   string | null;
  bankAccountName: string | null;
  pvGroupTag:      string | null;
}

interface EntityData {
  id: string;
  legalName: string;
  name: string | null;
  tradingName: string | null;
  registrationNo: string | null;
  oldRegistrationNo: string | null;
  incorporationDate: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  financialYearStartMonth: number;
  sstRegistered: boolean;
  sstRegistrationNo: string | null;
  sstEffectiveDate: string | null;
  sstFilingFrequency: string;
  eInvoiceEnabled: boolean;
  tin: string | null;
  myInvoisClientId: string | null;
  myInvoisClientSecret: string | null;
  myInvoisEnvironment: string;
  eInvoiceEffectiveDate: string | null;
  directorName: string | null;
  directorIcNo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  isActive: boolean;
  panelEnabled: boolean;
  sstOnForeigner: boolean;
  pvMode: string;          // "GROUPED" | "PER_CLINIC"
  clinics: Clinic[];
}

interface SstPeriod {
  period: string;
  label: string;
  startDate: string;
  endDate: string;
  dueDate: string;
}

function getFYPreview(month: number, year?: number): { label: string; start: string; end: string } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const fyYear = year ?? (currentMonth >= month ? currentYear : currentYear - 1);
  const start = new Date(fyYear, month - 1, 1);
  const end = month === 1
    ? new Date(fyYear, 11, 31)
    : new Date(fyYear + 1, month - 1, 0);
  const label = month === 1
    ? `FY${fyYear}`
    : `FY${fyYear}/${String(fyYear + 1).slice(2)}`;
  return {
    label,
    start: start.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }),
    end:   end.toLocaleDateString("en-MY",   { day: "numeric", month: "long", year: "numeric" }),
  };
}

function getSstPeriodStatus(startDate: string, dueDate: string): "Upcoming" | "Current" | "Overdue" {
  const today = new Date();
  const start = new Date(startDate);
  const due = new Date(dueDate);
  if (today > due) return "Overdue";
  if (today >= start) return "Current";
  return "Upcoming";
}

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
      type === "success" ? "bg-green-600" : "bg-red-600"
    }`}>
      {message}
    </div>
  );
}

export function CompanyDetailClient({ entity: initial }: { entity: EntityData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Company Info");
  const [entity, setEntity] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // FY confirmation dialog state
  const [fyConfirmPending, setFyConfirmPending] = useState(false);
  const [fyPendingMonth, setFyPendingMonth] = useState<number | null>(null);

  // SST periods
  const [sstPeriods, setSstPeriods] = useState<SstPeriod[]>([]);
  const [sstPeriodsLoaded, setSstPeriodsLoaded] = useState(false);
  const [sstFyYear, setSstFyYear] = useState(new Date().getFullYear());

  // e-Invoice credential reveal
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newClientSecret, setNewClientSecret] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  async function save(patch: Record<string, unknown>, confirmed = false) {
    setSaving(true);
    try {
      const body = confirmed ? { ...patch, confirmed: true } : patch;
      const res = await fetch(`/api/entities/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.requiresConfirmation) {
        setFyPendingMonth(Number(patch.financialYearStartMonth));
        setFyConfirmPending(true);
        setSaving(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setEntity((prev) => ({ ...prev, ...data }));
      showToast("Saved successfully", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function loadSstPeriods(year: number) {
    const res = await fetch(`/api/entities/${entity.id}/sst-periods?fyYear=${year}`);
    if (res.ok) {
      setSstPeriods(await res.json());
      setSstPeriodsLoaded(true);
    }
  }

  async function testEInvoice() {
    setTestingConnection(true);
    try {
      const res = await fetch(`/api/entities/${entity.id}/test-einvoice`, { method: "POST" });
      const data = await res.json();
      if (data.success) showToast(data.message, "success");
      else showToast("Connection test failed", "error");
    } catch {
      showToast("Connection test failed", "error");
    } finally {
      setTestingConnection(false);
    }
  }

  // ── Tab 1: Company Info ──────────────────────────────────────────────────
  function CompanyInfoTab() {
    const [form, setForm] = useState({
      legalName:        entity.legalName,
      tradingName:      entity.tradingName ?? "",
      registrationNo:   entity.registrationNo ?? "",
      oldRegistrationNo: entity.oldRegistrationNo ?? "",
      incorporationDate: entity.incorporationDate ? entity.incorporationDate.slice(0,10) : "",
      address:          entity.address ?? "",
      city:             entity.city ?? "",
      state:            entity.state ?? "",
      postcode:         entity.postcode ?? "",
      country:          entity.country,
      phone:            entity.phone ?? "",
      email:            entity.email ?? "",
      website:          entity.website ?? "",
      directorName:     entity.directorName ?? "",
      directorIcNo:     entity.directorIcNo ?? "",
      isActive:         entity.isActive,
    });

    return (
      <div className="space-y-6">
        {/* Company identity */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Company Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Legal Name (SSM) *</label>
              <input className="form-input" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Trading Name</label>
              <input className="form-input" value={form.tradingName} onChange={(e) => setForm({ ...form, tradingName: e.target.value })} />
            </div>
            <div>
              <label className="form-label">SSM Registration No</label>
              <input className="form-input" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Old Registration No</label>
              <input className="form-input" value={form.oldRegistrationNo} onChange={(e) => setForm({ ...form, oldRegistrationNo: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Incorporation Date</label>
              <input type="date" className="form-input" value={form.incorporationDate} onChange={(e) => setForm({ ...form, incorporationDate: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Address */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Address</h3>
          <div className="space-y-4">
            <div>
              <label className="form-label">Address</label>
              <textarea className="form-input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">City</label>
                <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label className="form-label">State</label>
                <select className="form-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  <option value="">Select state</option>
                  {MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Postcode</label>
                <input className="form-input" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="form-label">Country</label>
              <input className="form-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Contact */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Website</label>
              <input className="form-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Director */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Director</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Director Name</label>
              <input className="form-input" value={form.directorName} onChange={(e) => setForm({ ...form, directorName: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Director IC No</label>
              <input className="form-input" value={form.directorIcNo} onChange={(e) => setForm({ ...form, directorIcNo: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Status */}
        <section>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-slate-300 w-4 h-4"
            />
            <span className="text-sm font-medium text-slate-700">Active</span>
          </label>
        </section>

        <button
          disabled={saving}
          onClick={() => save({
            legalName:        form.legalName,
            tradingName:      form.tradingName || null,
            registrationNo:   form.registrationNo || null,
            oldRegistrationNo: form.oldRegistrationNo || null,
            incorporationDate: form.incorporationDate || null,
            address:          form.address || null,
            city:             form.city || null,
            state:            form.state || null,
            postcode:         form.postcode || null,
            country:          form.country,
            phone:            form.phone || null,
            email:            form.email || null,
            website:          form.website || null,
            directorName:     form.directorName || null,
            directorIcNo:     form.directorIcNo || null,
            isActive:         form.isActive,
          })}
          className="btn-primary px-6 py-2 text-sm"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    );
  }

  // ── Tab 2: Financial Settings ────────────────────────────────────────────
  function FinancialSettingsTab() {
    const [fyMonth, setFyMonth] = useState(entity.financialYearStartMonth);
    const current = getFYPreview(fyMonth);
    const next = getFYPreview(fyMonth, new Date().getFullYear() + 1);
    const changed = fyMonth !== entity.financialYearStartMonth;

    // 4x3 calendar grid
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      // Month is in current FY if fyMonth === 1: all year; else from fyMonth to fyMonth-1 next year
      let inFY: boolean;
      if (fyMonth === 1) {
        inFY = true;
      } else {
        // months >= fyMonth are in the FY; months < fyMonth are in the next FY
        inFY = m >= fyMonth || m < fyMonth; // all months are in *some* FY — just mark current FY months
        // More accurate: current FY spans fyMonth..12 and 1..(fyMonth-1) of next year
        // For display purposes: highlight the 12 months of the FY starting at fyMonth
        inFY = true; // all months belong to some FY; we'll just mark start
      }
      const isStart = m === fyMonth;
      return { m, label: MONTH_SHORT[i], inFY, isStart };
    });

    // Split by FY: months in "current year" portion vs "next year" portion
    const isInCurrentFY = (m: number) => {
      if (fyMonth === 1) return true;
      return m >= fyMonth;
    };

    return (
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Financial Year Start Month</h3>
          <select
            className="form-input w-56"
            value={fyMonth}
            onChange={(e) => setFyMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>

          {/* Preview */}
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-1">
            <p className="text-sm font-medium text-blue-800">Current FY: {current.label}</p>
            <p className="text-sm text-blue-700">{current.start} — {current.end}</p>
            <p className="text-xs text-blue-600 mt-1">Next FY: {next.label} ({next.start} — {next.end})</p>
          </div>

          {/* Warning if changing */}
          {changed && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2">
              <span className="text-amber-600 font-bold">⚠</span>
              <p className="text-sm text-amber-800">
                Changing financial year start affects reporting periods, leave entitlements, and SST filing. Historical data will not be recalculated.
              </p>
            </div>
          )}
        </section>

        {/* 12-month calendar grid */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Month Overview</h3>
          <div className="grid grid-cols-4 gap-2">
            {months.map(({ m, label, isStart }) => {
              const inCurrent = isInCurrentFY(m);
              return (
                <div
                  key={m}
                  className={`rounded-md p-2 text-center text-xs font-medium border ${
                    isStart
                      ? "bg-blue-600 text-white border-blue-600"
                      : inCurrent
                      ? "bg-blue-100 text-blue-800 border-blue-200"
                      : "bg-slate-50 text-slate-400 border-slate-200"
                  }`}
                >
                  {label}
                  {isStart && <div className="text-[10px] mt-0.5 opacity-90">FY Start</div>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2">Blue = current FY | Dark blue = FY start month</p>
        </section>

        {/* Confirmation dialog */}
        {fyConfirmPending && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
              <h3 className="font-semibold text-slate-900 mb-2">Confirm Financial Year Change</h3>
              <p className="text-sm text-slate-600 mb-4">
                Changing the financial year start month will affect reporting periods, leave entitlements, and SST filing periods. Existing historical data will not be recalculated. Are you sure?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  className="btn-outline px-4 py-2 text-sm"
                  onClick={() => { setFyConfirmPending(false); setFyPendingMonth(null); }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary px-4 py-2 text-sm"
                  onClick={async () => {
                    setFyConfirmPending(false);
                    await save({ financialYearStartMonth: fyPendingMonth }, true);
                    setFyPendingMonth(null);
                  }}
                >
                  Confirm Change
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          disabled={saving}
          onClick={() => save({ financialYearStartMonth: fyMonth })}
          className="btn-primary px-6 py-2 text-sm"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    );
  }

  // ── Tab 3: SST ──────────────────────────────────────────────────────────
  function SstTab() {
    const [form, setForm] = useState({
      sstRegistered:     entity.sstRegistered,
      sstRegistrationNo: entity.sstRegistrationNo ?? "",
      sstEffectiveDate:  entity.sstEffectiveDate ? entity.sstEffectiveDate.slice(0,10) : "",
      sstFilingFrequency: entity.sstFilingFrequency,
      sstOnForeigner:    entity.sstOnForeigner,
    });

    const today = new Date();

    return (
      <div className="space-y-6">
        {/* Toggle */}
        <section>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.sstRegistered}
              onChange={(e) => setForm({ ...form, sstRegistered: e.target.checked })}
              className="rounded border-slate-300 w-4 h-4"
            />
            <span className="text-sm font-medium text-slate-700">SST Registered</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={form.sstOnForeigner}
              onChange={(e) => setForm({ ...form, sstOnForeigner: e.target.checked })}
              className="rounded border-slate-300 w-4 h-4"
            />
            <span className="text-sm font-medium text-slate-700">Apply SST to Foreign Patients</span>
          </label>
        </section>

        {form.sstRegistered && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">SST Registration No</label>
                <input className="form-input" value={form.sstRegistrationNo} onChange={(e) => setForm({ ...form, sstRegistrationNo: e.target.value })} />
              </div>
              <div>
                <label className="form-label">SST Effective Date</label>
                <input type="date" className="form-input" value={form.sstEffectiveDate} onChange={(e) => setForm({ ...form, sstEffectiveDate: e.target.value })} />
              </div>
            </div>
          </section>
        )}

        {/* Filing Frequency */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Filing Frequency</h3>
          <div className="flex gap-4">
            {[["BI_MONTHLY","Bi-monthly"],["MONTHLY","Monthly"],["QUARTERLY","Quarterly"]].map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="filingFreq"
                  value={val}
                  checked={form.sstFilingFrequency === val}
                  onChange={() => setForm({ ...form, sstFilingFrequency: val })}
                  className="border-slate-300"
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* SST Filing Periods */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">SST Filing Periods</h3>
            <div className="flex items-center gap-2">
              <select
                className="form-input text-sm py-1 w-28"
                value={sstFyYear}
                onChange={(e) => { setSstFyYear(Number(e.target.value)); setSstPeriodsLoaded(false); }}
              >
                {[today.getFullYear()-1, today.getFullYear(), today.getFullYear()+1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => loadSstPeriods(sstFyYear)}
                className="btn-outline text-xs px-3 py-1"
              >
                Load
              </button>
            </div>
          </div>

          {sstPeriodsLoaded && sstPeriods.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 font-medium">Date Range</th>
                    <th className="pb-2 font-medium">Due Date</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sstPeriods.map((p) => {
                    const status = getSstPeriodStatus(p.startDate, p.dueDate);
                    return (
                      <tr
                        key={p.period}
                        className={`border-b border-slate-100 ${status === "Current" ? "bg-blue-50" : ""}`}
                      >
                        <td className="py-2 font-medium text-slate-700">{p.period}</td>
                        <td className="py-2 text-slate-600">{p.label}</td>
                        <td className="py-2 text-slate-600">{new Date(p.dueDate).toLocaleDateString("en-MY")}</td>
                        <td className="py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            status === "Overdue" ? "badge-red" :
                            status === "Current" ? "badge-blue" :
                            "bg-slate-100 text-slate-500"
                          }`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <button
          disabled={saving}
          onClick={() => save({
            sstRegistered:     form.sstRegistered,
            sstRegistrationNo: form.sstRegistrationNo || null,
            sstEffectiveDate:  form.sstEffectiveDate || null,
            sstFilingFrequency: form.sstFilingFrequency,
            sstOnForeigner:    form.sstOnForeigner,
          })}
          className="btn-primary px-6 py-2 text-sm"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    );
  }

  // ── Tab 4: e-Invoice ─────────────────────────────────────────────────────
  function EInvoiceTab() {
    const [form, setForm] = useState({
      eInvoiceEnabled:      entity.eInvoiceEnabled,
      myInvoisEnvironment:  entity.myInvoisEnvironment,
      eInvoiceEffectiveDate: entity.eInvoiceEffectiveDate ? entity.eInvoiceEffectiveDate.slice(0,10) : "",
      tin:                  entity.tin ?? "",
    });

    return (
      <div className="space-y-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.eInvoiceEnabled}
            onChange={(e) => setForm({ ...form, eInvoiceEnabled: e.target.checked })}
            className="rounded border-slate-300 w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700">Enable e-Invoice (MyInvois)</span>
        </label>

        {form.eInvoiceEnabled && (
          <>
            {/* Environment */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Environment</h3>
              <div className="flex gap-4">
                {["SANDBOX","PRODUCTION"].map((env) => (
                  <label key={env} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="env"
                      value={env}
                      checked={form.myInvoisEnvironment === env}
                      onChange={() => setForm({ ...form, myInvoisEnvironment: env })}
                    />
                    <span className="text-sm text-slate-700 capitalize">{env.toLowerCase()}</span>
                  </label>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">e-Invoice Effective Date</label>
                <input type="date" className="form-input" value={form.eInvoiceEffectiveDate} onChange={(e) => setForm({ ...form, eInvoiceEffectiveDate: e.target.value })} />
              </div>
              <div>
                <label className="form-label">TIN (Tax Identification Number)</label>
                <input className="form-input" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} placeholder="e.g. C123456789" />
              </div>
            </div>

            {/* Client ID */}
            <section>
              <label className="form-label">MyInvois Client ID</label>
              {showClientId ? (
                <input
                  className="form-input"
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  placeholder="Enter new Client ID"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input className="form-input flex-1" value={entity.myInvoisClientId ?? "(not set)"} readOnly disabled />
                  <button onClick={() => setShowClientId(true)} className="btn-outline px-3 py-2 text-sm">Update</button>
                </div>
              )}
            </section>

            {/* Client Secret */}
            <section>
              <label className="form-label">MyInvois Client Secret</label>
              {showClientSecret ? (
                <input
                  className="form-input"
                  type="password"
                  value={newClientSecret}
                  onChange={(e) => setNewClientSecret(e.target.value)}
                  placeholder="Enter new Client Secret"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input className="form-input flex-1" value={entity.myInvoisClientSecret ?? "(not set)"} readOnly disabled />
                  <button onClick={() => setShowClientSecret(true)} className="btn-outline px-3 py-2 text-sm">Update</button>
                </div>
              )}
            </section>

            {/* Test Connection */}
            <button
              disabled={testingConnection}
              onClick={testEInvoice}
              className="btn-outline px-4 py-2 text-sm"
            >
              {testingConnection ? "Testing…" : "Test Connection"}
            </button>
          </>
        )}

        <button
          disabled={saving}
          onClick={() => {
            const patch: Record<string, unknown> = {
              eInvoiceEnabled:      form.eInvoiceEnabled,
              myInvoisEnvironment:  form.myInvoisEnvironment,
              eInvoiceEffectiveDate: form.eInvoiceEffectiveDate || null,
              tin:                  form.tin || null,
            };
            if (showClientId && newClientId) patch.myInvoisClientId = newClientId;
            if (showClientSecret && newClientSecret) patch.myInvoisClientSecret = newClientSecret;
            save(patch);
          }}
          className="btn-primary px-6 py-2 text-sm"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    );
  }

  // ── Tab 5: Clinics ───────────────────────────────────────────────────────
  function ClinicsTab() {
    const pvMode = (entity as any).pvMode ?? "PER_CLINIC";
    const isGrouped = pvMode === "GROUPED";

    const blankBranch: Omit<Clinic, "id" | "director" | "pic"> = {
      name: "", slug: "", isHQ: false,
      address: null, city: null, state: null, postcode: null,
      phone: null, email: null, directorId: null, picId: null,
      bankName: null, bankAccountNo: null, bankAccountName: null,
      pvGroupTag: null,
    };

    const [clinics, setClinics] = useState<Clinic[]>(entity.clinics);
    const [showModal, setShowModal] = useState(false);
    const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
    const [form, setForm] = useState<typeof blankBranch>({ ...blankBranch });
    const [savingBranch, setSavingBranch] = useState(false);
    const [branchError, setBranchError] = useState("");
    const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);

    const MY_STATES = [
      "Johor","Kedah","Kelantan","Melaka","Negeri Sembilan","Pahang",
      "Perak","Perlis","Pulau Pinang","Sabah","Sarawak","Selangor",
      "Terengganu","Kuala Lumpur","Labuan","Putrajaya",
    ];

    function openAdd() {
      setEditingClinic(null);
      setForm({ ...blankBranch });
      setBranchError("");
      if (users.length === 0) {
        fetch("/api/users?role=all").then(r => r.json()).then(setUsers).catch(() => {});
      }
      setShowModal(true);
    }

    function openEdit(c: Clinic) {
      setEditingClinic(c);
      setForm({
        name: c.name, slug: c.slug ?? "", isHQ: c.isHQ,
        address: c.address, city: c.city, state: c.state,
        postcode: c.postcode, phone: c.phone, email: c.email,
        directorId: c.directorId, picId: c.picId,
        bankName: c.bankName, bankAccountNo: c.bankAccountNo,
        bankAccountName: c.bankAccountName, pvGroupTag: c.pvGroupTag,
      });
      setBranchError("");
      if (users.length === 0) {
        fetch("/api/users?role=all").then(r => r.json()).then(setUsers).catch(() => {});
      }
      setShowModal(true);
    }

    async function saveBranch() {
      if (!form.name.trim()) { setBranchError("Branch name is required"); return; }
      setSavingBranch(true); setBranchError("");
      try {
        const url    = editingClinic ? `/api/clinics/${editingClinic.id}` : "/api/clinics";
        const method = editingClinic ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, entityId: entity.id }),
        });
        const data = await res.json();
        if (!res.ok) { setBranchError(data.error ?? "Save failed"); return; }

        if (editingClinic) {
          setClinics(prev => prev.map(c => c.id === editingClinic.id ? { ...c, ...data } : c));
        } else {
          setClinics(prev => [...prev, data]);
        }
        setShowModal(false);
        showToast(editingClinic ? "Branch updated" : "Branch added successfully", "success");
        router.refresh();
      } catch {
        setBranchError("An error occurred");
      } finally {
        setSavingBranch(false);
      }
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {clinics.length} branch{clinics.length !== 1 ? "es" : ""} under this company
          </p>
          <button onClick={openAdd} className="btn-primary text-sm px-4 py-2">
            + Add Branch
          </button>
        </div>

        {/* Branch list */}
        <div className="space-y-2">
          {clinics.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm card">
              No branches yet. Click "Add Branch" to create the first one.
            </div>
          )}
          {clinics.map((clinic) => (
            <div key={clinic.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{clinic.name}</span>
                  {clinic.isHQ && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">HQ</span>
                  )}
                  {clinic.slug && (
                    <span className="text-xs text-slate-400 font-mono">/{clinic.slug}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(", ") && (
                    <span>📍 {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(", ")}</span>
                  )}
                  {clinic.phone && <span>📞 {clinic.phone}</span>}
                  {clinic.email && <span>✉ {clinic.email}</span>}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-slate-500">
                  {clinic.director && <span>Director: <span className="text-slate-700">{clinic.director.name}</span></span>}
                  {clinic.pic      && <span>PIC: <span className="text-slate-700">{clinic.pic.name}</span></span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(clinic)} className="btn-outline text-xs px-3 py-1.5">Edit</button>
                <Link href={`/config?clinic=${clinic.id}`} className="text-xs text-blue-600 hover:underline">Settings →</Link>
              </div>
            </div>
          ))}
        </div>

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">
                  {editingClinic ? `Edit Branch — ${editingClinic.name}` : "Add New Branch"}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
              </div>

              {/* Modal body */}
              <div className="px-6 py-5 overflow-y-auto space-y-4">
                {/* Basic */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="form-label">Branch Name *</label>
                    <input
                      className="form-input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. KL City Branch"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="form-label">URL Slug</label>
                    <input
                      className="form-input font-mono text-sm"
                      value={form.slug ?? ""}
                      onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                      placeholder="kl-city"
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-generated if blank</p>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isHQ}
                        onChange={e => setForm(f => ({ ...f, isHQ: e.target.checked }))}
                        className="rounded border-slate-300 w-4 h-4"
                      />
                      <span className="text-sm text-slate-700 font-medium">Headquarters (HQ)</span>
                    </label>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Address</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="form-label text-xs">Street Address</label>
                      <input className="form-input text-sm" value={form.address ?? ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">City</label>
                      <input className="form-input text-sm" value={form.city ?? ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">State</label>
                      <select className="form-input text-sm" value={form.state ?? ""} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                        <option value="">— select —</option>
                        {MY_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label text-xs">Postcode</label>
                      <input className="form-input text-sm" value={form.postcode ?? ""} onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Phone</label>
                      <input className="form-input text-sm" value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="form-label text-xs">Email</label>
                      <input type="email" className="form-input text-sm" value={form.email ?? ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Approvers */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment Voucher Approvers</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">Director</label>
                      <select className="form-input text-sm" value={form.directorId ?? ""} onChange={e => setForm(f => ({ ...f, directorId: e.target.value || null }))}>
                        <option value="">— none —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                      </select>
                      <p className="text-xs text-slate-400 mt-0.5">Approves PV content</p>
                    </div>
                    <div>
                      <label className="form-label text-xs">PIC (Bank Approver)</label>
                      <select className="form-input text-sm" value={form.picId ?? ""} onChange={e => setForm(f => ({ ...f, picId: e.target.value || null }))}>
                        <option value="">— none —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                      </select>
                      <p className="text-xs text-slate-400 mt-0.5">Approves bank transfers</p>
                    </div>
                  </div>
                </div>

                {/* Bank account — only relevant in PER_CLINIC mode */}
                {!isGrouped && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Branch Bank Account
                      <span className="ml-2 text-slate-400 font-normal normal-case">auto-filled when creating PVs for this branch</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label text-xs">Bank Name</label>
                        <input className="form-input text-sm" value={form.bankName ?? ""} onChange={e => setForm(f => ({ ...f, bankName: e.target.value || null }))} placeholder="e.g. Maybank" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Account No</label>
                        <input className="form-input text-sm" value={form.bankAccountNo ?? ""} onChange={e => setForm(f => ({ ...f, bankAccountNo: e.target.value || null }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="form-label text-xs">Account Name</label>
                        <input className="form-input text-sm" value={form.bankAccountName ?? ""} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value || null }))} />
                      </div>
                    </div>
                  </div>
                )}

                {/* PV group tag — only relevant in GROUPED mode */}
                {isGrouped && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      PV Group Tag
                      <span className="ml-2 text-slate-400 font-normal normal-case">branches with the same tag are grouped into one PV</span>
                    </p>
                    <input
                      className="form-input text-sm"
                      value={form.pvGroupTag ?? ""}
                      onChange={e => setForm(f => ({ ...f, pvGroupTag: e.target.value || null }))}
                      placeholder="e.g. MAIN  (leave blank to include in default group)"
                    />
                  </div>
                )}

                {branchError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{branchError}</div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={saveBranch} disabled={savingBranch} className="btn-primary disabled:opacity-50">
                  {savingBranch ? "Saving…" : editingClinic ? "Save Changes" : "Add Branch"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Tab 6: Bank & PV Settings ────────────────────────────────────────────
  function BankDetailsTab() {
    const [form, setForm] = useState({
      pvMode:         (entity as any).pvMode ?? "PER_CLINIC",
      bankName:       entity.bankName ?? "",
      bankAccountNo:  entity.bankAccountNo ?? "",
      bankAccountName: entity.bankAccountName ?? "",
    });

    const isGrouped = form.pvMode === "GROUPED";

    return (
      <div className="space-y-6">

        {/* PV Mode */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Payment Voucher Mode</h3>
          <p className="text-xs text-slate-500 mb-3">
            Controls how payment vouchers are created for branches under this company.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                value: "PER_CLINIC",
                title: "Per Branch",
                desc: "Each branch has its own separate PV with its own bank account. Use this when branches pay suppliers independently.",
              },
              {
                value: "GROUPED",
                title: "Grouped (Shared Bank)",
                desc: "All branches share one bank account. One PV covers all selected branches. Use this when the company pays all suppliers centrally.",
              },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`relative flex flex-col gap-1 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  form.pvMode === opt.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="pvMode"
                  value={opt.value}
                  checked={form.pvMode === opt.value}
                  onChange={() => setForm(f => ({ ...f, pvMode: opt.value }))}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    form.pvMode === opt.value ? "border-blue-500" : "border-slate-300"
                  }`}>
                    {form.pvMode === opt.value && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{opt.title}</span>
                </div>
                <p className="text-xs text-slate-500 pl-6">{opt.desc}</p>
              </label>
            ))}
          </div>
        </section>

        {/* Shared bank account (GROUPED mode) */}
        {isGrouped && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Shared Bank Account</h3>
            <p className="text-xs text-slate-500 mb-3">
              This bank account will be auto-filled on every PV created under this company.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Bank Name</label>
                <input className="form-input" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="e.g. Maybank" />
              </div>
              <div>
                <label className="form-label">Account No</label>
                <input className="form-input" value={form.bankAccountNo} onChange={e => setForm(f => ({ ...f, bankAccountNo: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Account Name</label>
                <input className="form-input" value={form.bankAccountName} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value }))} />
              </div>
            </div>
          </section>
        )}

        {/* Per-clinic note */}
        {!isGrouped && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600">
            <p className="font-medium text-slate-700 mb-1">Per Branch mode</p>
            <p className="text-xs text-slate-500">
              Each branch's bank account is configured in the <strong>Branches</strong> tab.
              When creating a PV, the bank details will be auto-filled from the selected branch.
            </p>
          </div>
        )}

        <button
          disabled={saving}
          onClick={() => save({
            pvMode:         form.pvMode,
            bankName:       isGrouped ? (form.bankName || null) : null,
            bankAccountNo:  isGrouped ? (form.bankAccountNo || null) : null,
            bankAccountName: isGrouped ? (form.bankAccountName || null) : null,
          })}
          className="btn-primary px-6 py-2 text-sm"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link href="/admin/companies" className="text-sm text-slate-400 hover:text-slate-600">Companies</Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-600">{entity.legalName}</span>
      </div>
      <h1 className="page-title mb-6">{entity.name ?? entity.legalName}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "Company Info"       && <CompanyInfoTab />}
        {activeTab === "Financial Settings" && <FinancialSettingsTab />}
        {activeTab === "SST"                && <SstTab />}
        {activeTab === "e-Invoice"          && <EInvoiceTab />}
        {activeTab === "Branches"           && <ClinicsTab />}
        {activeTab === "Bank & PV Settings" && <BankDetailsTab />}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
