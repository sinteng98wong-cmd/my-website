"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export type CaseRow = {
  id: string;
  patientName:   string;
  patientRef:    string;
  treatmentName: string;
  planRef:       string | null;
  bucket:        string;
  billed:        number;
  labFee:        number;
  labFeeConfirmed: boolean | null;
  net:           number;
  weightagePct:  number; // cumulative % of stages completed (one-off = 100)
  gained:        number; // net × weightage%
};

interface Props {
  month:      string;
  doctorName: string | null;
  doctorRate: number; // %
  rows:       CaseRow[];
}

// Same bucket order/labels as the payout table
const BUCKETS: { key: string; label: string; hint: string; badge: string }[] = [
  { key: "pending_verification", label: "Pending Verification",    hint: "Counter / doctor verification not done yet",       badge: "badge-slate"  },
  { key: "pending_lab",          label: "Pending Lab Invoice",     hint: "Waiting for the physical lab invoice",             badge: "badge-amber"  },
  { key: "pending_completion",   label: "Pending Completion",      hint: "Case stages not finished — funds locked",          badge: "badge-amber"  },
  { key: "pending_payment",      label: "Pending Patient Payment", hint: "Patient hasn't reached the payment threshold",     badge: "badge-purple" },
  { key: "ready_to_release",     label: "Ready to Release",        hint: "Conditions met — run Check Release",               badge: "badge-blue"   },
  { key: "ready_to_pay",         label: "Ready to Pay",            hint: "Released — finance can mark as paid",               badge: "badge-blue"   },
  { key: "paid",                 label: "Paid",                    hint: "Payout completed",                                 badge: "badge-green"  },
  { key: "voided",               label: "Voided",                  hint: "Cancelled",                                        badge: "badge-red"    },
];

function LabFee({ r }: { r: CaseRow }) {
  if (r.labFee <= 0) return <span className="text-slate-300">—</span>;
  return (
    <>
      {RM(r.labFee)}
      {r.labFeeConfirmed
        ? <span className="text-[10px] text-green-600 font-medium block">✓ Confirmed</span>
        : <span className="text-[10px] text-amber-600 block">(est.)</span>}
    </>
  );
}

function Group({ bucket, rows }: { bucket: typeof BUCKETS[number]; rows: CaseRow[] }) {
  const [open, setOpen] = useState(bucket.key !== "paid" && bucket.key !== "voided");
  const gained = rows.reduce((s, r) => s + r.gained, 0);
  const net    = rows.reduce((s, r) => s + r.net, 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className={`${bucket.badge} text-[11px]`}>{rows.length}</span>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{bucket.label}</p>
            <p className="text-xs text-slate-400">{bucket.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Gained</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(gained)}</p>
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Patient", "Treatment", "Billed", "Lab Fee", "Net", "Weightage", "Net × Weightage"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{r.patientName}</p>
                    <p className="text-xs text-slate-400 font-mono">{r.patientRef}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-700">{r.treatmentName}</p>
                    {r.planRef && <p className="text-xs text-slate-400">{r.planRef}</p>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{RM(r.billed)}</td>
                  <td className="px-4 py-2.5 tabular-nums"><LabFee r={r} /></td>
                  <td className="px-4 py-2.5 tabular-nums">{RM(r.net)}</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium text-blue-700">{r.weightagePct}%</td>
                  <td className="px-4 py-2.5 tabular-nums font-medium">{RM(r.gained)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={4} className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase text-right">Subtotal</td>
                <td className="px-4 py-2 tabular-nums font-semibold text-slate-700">{RM(net)}</td>
                <td />
                <td className="px-4 py-2 tabular-nums font-bold text-slate-800">{RM(gained)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Case Progress — the doctor's month cases grouped by workflow status, with
 * the weightage math per case (net × cumulative stage weightage) so they can
 * track pending cases and see the month's entitlement.
 */
export function CaseProgressPanel({ month, doctorName, doctorRate, rows }: Props) {
  const grouped = BUCKETS
    .map(b => ({ bucket: b, rows: rows.filter(r => r.bucket === b.key) }))
    .filter(g => g.rows.length > 0);

  const totalGained = rows.reduce((s, r) => s + r.gained, 0);
  const entitled = Math.round(totalGained * doctorRate) / 100;

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><Layers size={24} /></div>
          <p className="font-medium text-slate-700">No cases for {month}</p>
          <p className="text-sm text-slate-400">Cases appear here as treatments are recorded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(g => <Group key={g.bucket.key} bucket={g.bucket} rows={g.rows} />)}

      {/* Total × doctor % */}
      <div className="card p-4">
        <div className="space-y-1.5 text-sm max-w-md ml-auto">
          <div className="flex justify-between text-slate-600">
            <span>Total gained (Σ net × weightage){doctorName ? ` — ${doctorName}` : ""}</span>
            <span className="tabular-nums">{RM(totalGained)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>× Doctor&apos;s share ({doctorRate}%)</span>
            <span className="tabular-nums">{RM(entitled)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-300 font-bold text-slate-900">
            <span>Entitled Commission ({month})</span>
            <span className="tabular-nums text-blue-700">{RM(entitled)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
