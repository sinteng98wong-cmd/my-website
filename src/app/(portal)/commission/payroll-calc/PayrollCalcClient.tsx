"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const PAY_TYPE_CONFIG: Record<string, { badge: string; label: string; desc: string }> = {
  PURE_SALARIED:    { badge: "badge-blue",   label: "Pure Salaried",  desc: "Fixed salary + allowances regardless of clinical output." },
  LOCUM_WITH_FLOOR: { badge: "badge-amber",  label: "Locum + Floor",  desc: "Higher of clinical fees or guaranteed floor." },
  PURE_PROF_FEES:   { badge: "badge-purple", label: "Prof. Fees Only", desc: "Strictly clinical — no floor, no salary." },
};

type Doctor = {
  id: string; name: string; email: string; type: string;
  defaultRate: number; dayRate: number | null;
  engagement: { sessionsWorked: number; guaranteedFloor: number } | null;
};
type AncillaryLine = { key: string; label: string; count: number; ratePerItem: number; total: number };
type DeductionLine = { description: string; amount: number };
type PayrollResult = {
  doctorId: string; month: string; payType: string;
  professionalFeesCut: number; baseSalary: number; allowances: number;
  guaranteedFloor: number; finalBasePay: number;
  ancillaryAdditions: AncillaryLine[]; ancillaryTotal: number;
  disciplinaryDeductions: DeductionLine[]; deductionTotal: number;
  totalPayablePayout: number;
  splitWarnings?: { treatmentId: string; totalSplit: number }[];
};

// ── Generate Slip ─────────────────────────────────────────────────────────────

function GenerateSlipButton({ doctorId, month }: { doctorId: string; month: string }) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true); setError("");
    const res = await fetch("/api/commission/locum-statement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, month }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Failed to generate slip"); return; }
    router.push(`/commission/${data.statementId}`);
  }

  return (
    <div className="space-y-2">
      <button onClick={generate} disabled={busy} className="btn-primary gap-2">
        {busy ? <><Spinner /> Generating…</> : <>📄 Generate Statement</>}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function LineItem({ label, value, plus, minus, note, bold }: {
  label: string; value?: string; plus?: boolean; minus?: boolean; note?: boolean; bold?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-2 text-sm border-b border-slate-50 last:border-0 ${
      note ? "text-slate-400 italic text-xs" : ""
    } ${bold ? "font-semibold" : ""}`}>
      <span className={note ? "" : "text-slate-600"}>{label}</span>
      {value && (
        <span className={`tabular-nums ${
          plus  ? "text-green-700"
          : minus ? "text-red-600"
          : bold  ? "text-slate-900"
          : "text-slate-700"
        }`}>{value}</span>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: PayrollResult }) {
  const cfg = PAY_TYPE_CONFIG[result.payType] ?? PAY_TYPE_CONFIG.PURE_PROF_FEES;
  const floorWins = result.payType === "LOCUM_WITH_FLOOR" && result.finalBasePay === result.guaranteedFloor;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Calculation Result</p>
          <p className="font-semibold text-slate-900 mt-0.5">{result.month}</p>
        </div>
        <div className="text-right space-y-1">
          <span className={cfg.badge}>{cfg.label}</span>
          <p className="text-xs text-slate-400 max-w-[200px]">{cfg.desc}</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-0 divide-y divide-slate-50">
        {/* Step 1 */}
        <div className="pb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Step 1 — Professional Fees Cut</p>
          <LineItem label="Clinical treatment cut (net × split %)" value={RM(result.professionalFeesCut)} />
          {result.payType === "PURE_SALARIED" && (
            <p className="text-xs text-slate-400 italic mt-2">
              Tracked for reference only — does not affect base pay for salaried doctors.
            </p>
          )}
        </div>

        {/* Step 2 */}
        <div className="py-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Step 2 — Final Base Pay</p>
          {result.payType === "PURE_SALARIED" && (
            <>
              <LineItem label="Base salary"  value={RM(result.baseSalary)} />
              <LineItem label="Allowances"   value={RM(result.allowances)} />
            </>
          )}
          {result.payType === "LOCUM_WITH_FLOOR" && (
            <>
              <LineItem label="Professional fees cut" value={RM(result.professionalFeesCut)} />
              <LineItem label="Guaranteed floor"       value={RM(result.guaranteedFloor)} />
              <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
                floorWins
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                {floorWins
                  ? "⬆ Guaranteed floor wins — doctor topped up to floor"
                  : "⬆ Clinical fees win — above guaranteed floor"}
              </div>
            </>
          )}
          {result.payType === "PURE_PROF_FEES" && (
            <LineItem label="Strictly clinical (= fees cut)" value={RM(result.professionalFeesCut)} />
          )}
          <div className="flex justify-between items-center pt-3 mt-2 border-t border-slate-100 text-sm font-semibold">
            <span className="text-slate-700">Final Base Pay</span>
            <span className="text-slate-900 tabular-nums">{RM(result.finalBasePay)}</span>
          </div>
        </div>

        {/* Step 3A — Ancillaries */}
        {result.ancillaryAdditions.length > 0 && (
          <div className="py-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Step 3A — Ancillary Incentives</p>
            {result.ancillaryAdditions.map(a => (
              <LineItem key={a.key} label={`${a.label} (${a.count} × ${RM(a.ratePerItem)})`} value={`+ ${RM(a.total)}`} plus />
            ))}
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-slate-100 text-sm font-semibold">
              <span className="text-slate-700">Ancillary Total</span>
              <span className="text-green-700 tabular-nums">+ {RM(result.ancillaryTotal)}</span>
            </div>
          </div>
        )}

        {/* Step 3B — Deductions */}
        {result.disciplinaryDeductions.length > 0 && (
          <div className="py-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Step 3B — Disciplinary Deductions</p>
            {result.disciplinaryDeductions.map((d, i) => (
              <LineItem key={i} label={d.description} value={`− ${RM(d.amount)}`} minus />
            ))}
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-slate-100 text-sm font-semibold">
              <span className="text-slate-700">Deduction Total</span>
              <span className="text-red-600 tabular-nums">− {RM(result.deductionTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Final payout */}
      <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-green-50 to-emerald-50 border-t-2 border-green-200">
        <span className="font-bold text-slate-800">TOTAL PAYABLE PAYOUT</span>
        <span className="text-3xl font-bold text-green-700 tabular-nums">{RM(result.totalPayablePayout)}</span>
      </div>

      {/* Split warnings */}
      {result.splitWarnings && result.splitWarnings.length > 0 && (
        <div className="px-6 py-4 bg-red-50 border-t border-red-200">
          <div className="flex items-start gap-2">
            <span className="text-red-500 text-base flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Doctor split does not total 100%</p>
              <p className="text-xs text-red-600 mt-0.5">
                {result.splitWarnings.length} treatment{result.splitWarnings.length !== 1 ? "s have" : " has"} a total
                split that is not 100%. Each treatment must be fully allocated between all treating doctors.
                Please correct the splits before locking.
              </p>
              <div className="mt-2 space-y-1">
                {result.splitWarnings.map(w => (
                  <p key={w.treatmentId} className="text-xs text-red-700 font-mono">
                    Treatment {w.treatmentId.slice(-8)} — current total: <strong>{w.totalSplit}%</strong>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate slip — locum only */}
      {result.payType === "LOCUM_WITH_FLOOR" && (
        <div className="px-6 py-4 border-t border-slate-100 bg-blue-50/40 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Ready to finalise?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate the monthly statement to start the approval workflow.
            </p>
          </div>
          <GenerateSlipButton doctorId={result.doctorId} month={result.month} />
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PayrollCalcClient({ doctors, month, canCommit }: {
  doctors: Doctor[]; month: string; canCommit: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>(doctors[0]?.id ?? "");
  const [result,     setResult]     = useState<PayrollResult | null>(null);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState("");
  const [deductions, setDeductions] = useState<{ description: string; amount: string }[]>([]);

  const selectedDoctor = doctors.find(d => d.id === selectedId);

  async function run(commit: boolean) {
    if (!selectedId) return;
    setBusy(true); setError(""); setResult(null);

    const validDeductions = deductions
      .filter(d => d.description && Number(d.amount) > 0)
      .map(d => ({ description: d.description, amount: Number(d.amount) }));

    if (commit) {
      const res = await fetch("/api/commission/payroll-calc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: selectedId, month, disciplinaryDeductions: validDeductions }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setResult(data);
    } else {
      const url = `/api/commission/payroll-calc?doctorId=${selectedId}&month=${month}`;
      const res = await fetch(url);
      const data = await res.json();
      setBusy(false);
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setResult(data);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

      {/* ── Left panel ────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Doctor selector */}
        <div className="card p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Doctor</p>
          <div className="space-y-2">
            {doctors.map(d => {
              const isSelected = selectedId === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => { setSelectedId(d.id); setResult(null); setError(""); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      d.type === "LOCUM" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    }`}>{d.type}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    {d.dayRate && <span>RM {d.dayRate}/day</span>}
                    {d.engagement && <span>· {d.engagement.sessionsWorked} sessions · Floor RM {d.engagement.guaranteedFloor.toLocaleString()}</span>}
                    {!d.dayRate && !d.engagement && <span>Rate: {d.defaultRate}%</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Disciplinary deductions */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Deductions</p>
            <button
              onClick={() => setDeductions(prev => [...prev, { description: "", amount: "" }])}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add
            </button>
          </div>
          {deductions.length === 0 ? (
            <p className="text-xs text-slate-400">No deductions. Click + Add to enter one.</p>
          ) : (
            <div className="space-y-2">
              {deductions.map((d, i) => (
                <div key={i} className="space-y-1.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <input
                    value={d.description}
                    onChange={e => setDeductions(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Reason / description"
                    className="form-input text-xs"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      value={d.amount}
                      onChange={e => setDeductions(prev => prev.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="Amount (RM)"
                      type="number" min="0"
                      className="form-input text-xs"
                    />
                    <button
                      onClick={() => setDeductions(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={() => run(false)}
            disabled={busy || !selectedId}
            className="btn-outline w-full justify-center"
          >
            {busy ? <><Spinner /> Calculating…</> : "Preview"}
          </button>
          {canCommit && (
            <button
              onClick={() => run(true)}
              disabled={busy || !selectedId}
              className="btn-primary w-full justify-center"
            >
              {busy ? <><Spinner /> Calculating…</> : "Calculate & Save"}
            </button>
          )}
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            Preview is read-only.{canCommit ? ' "Calculate & Save" persists DRAFT commission rows.' : ""}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* ── Right panel ───────────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Empty / loading states */}
        {!result && !busy && (
          <div className="card p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl">🧮</div>
            <div>
              <p className="font-semibold text-slate-700">No calculation yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Select a doctor on the left and click <strong>Preview</strong>.
              </p>
            </div>
          </div>
        )}
        {busy && (
          <div className="card p-12 flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-slate-400">Calculating payroll breakdown…</p>
          </div>
        )}

        {result && <ResultCard result={result} />}

        {/* Selected doctor info */}
        {selectedDoctor && (
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Doctor Profile</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Contract",     value: selectedDoctor.type },
                { label: "Default rate", value: `${selectedDoctor.defaultRate}%` },
                { label: "Day rate",     value: selectedDoctor.dayRate ? `RM ${selectedDoctor.dayRate}` : "—" },
                { label: "Floor",        value: selectedDoctor.engagement
                    ? `RM ${selectedDoctor.engagement.guaranteedFloor.toLocaleString()} (${selectedDoctor.engagement.sessionsWorked} sessions)`
                    : "No engagement" },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-semibold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
    </svg>
  );
}
