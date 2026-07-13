import Link from "next/link";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export type MonthlyData = {
  categories:      { key: string; label: string; amount: number }[];
  grossTotal:      number;
  doctorRate:      number; // %
  professionalFee: number; // grossTotal × doctorRate%
  scans:           { code: string; label: string; patients: number; rate: number; net: number }[];
  scanTotal:       number;
  totalPayable:    number;
  oneOffDays:      { date: string; amount: number }[]; // one-off amount grouped by treatment date
  oneOffTotal:     number;
};

interface Props {
  month:      string;
  doctorName: string | null;
  data:       MonthlyData;
}

/**
 * Monthly commission slip in the clinic's spreadsheet layout:
 *   Gross Collection per case category → TOTAL
 *   Professional Fee = TOTAL × doctor % → NET
 *   Scans (patient count × flat rate) → NET
 *   TOTAL PAYABLE
 */
export function MonthlyCommissionPanel({ month, doctorName, data }: Props) {
  return (
    <div className="space-y-4">
      {/* Gross collection by category */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70">
          <p className="font-semibold text-slate-900 text-sm">
            Monthly Commission{doctorName ? ` — ${doctorName}` : ""} · {month}
          </p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {data.categories.map(c => (
              <tr key={c.key} className="border-b border-slate-50">
                <td className="px-5 py-2.5 text-slate-700">{c.label}</td>
                <td className="px-5 py-2.5 tabular-nums text-right w-48">
                  {c.amount > 0 ? RM(c.amount) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td className="px-5 py-2.5 font-bold text-slate-900 uppercase text-xs tracking-wide">Total</td>
              <td className="px-5 py-2.5 tabular-nums text-right font-bold text-slate-900">{RM(data.grossTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Professional fee + scans → total payable */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Category</th>
              <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
              <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">RM</th>
              <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">%</th>
              <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Net</th>
            </tr>
          </thead>
          <tbody>
            {/* Professional fee row */}
            <tr className="border-b border-slate-50 bg-blue-50/40">
              <td className="px-5 py-2.5 font-medium text-slate-800">Professional Fee</td>
              <td className="px-5 py-2.5 text-right text-slate-400">—</td>
              <td className="px-5 py-2.5 tabular-nums text-right">{RM(data.grossTotal)}</td>
              <td className="px-5 py-2.5 tabular-nums text-right text-slate-600">{data.doctorRate}%</td>
              <td className="px-5 py-2.5 tabular-nums text-right font-semibold text-slate-900">{RM(data.professionalFee)}</td>
            </tr>
            {/* Scan rows (flat rate) */}
            {data.scans.map(s => (
              <tr key={s.code} className="border-b border-slate-50">
                <td className="px-5 py-2.5 text-slate-700">{s.label}</td>
                <td className="px-5 py-2.5 tabular-nums text-right">{s.patients}</td>
                <td className="px-5 py-2.5 tabular-nums text-right text-slate-500">{RM(s.rate)}</td>
                <td className="px-5 py-2.5 text-right text-slate-300">—</td>
                <td className="px-5 py-2.5 tabular-nums text-right font-medium">{RM(s.net)}</td>
              </tr>
            ))}
            {data.scans.length === 0 && (
              <tr className="border-b border-slate-50">
                <td colSpan={5} className="px-5 py-2.5 text-center text-xs text-slate-400">No scans this month</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-5 py-3 font-bold text-slate-900 uppercase text-xs tracking-wide">Total Payable</td>
              <td className="px-5 py-3 tabular-nums text-right font-medium text-slate-500">
                {data.scans.reduce((s, r) => s + r.patients, 0)}
              </td>
              <td colSpan={2} />
              <td className="px-5 py-3 tabular-nums text-right font-bold text-blue-700 text-base">{RM(data.totalPayable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* One-off amount by day (grouped by treatment date) */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70">
          <p className="font-semibold text-slate-900 text-sm">One-Off Treatments by Day</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Daily one-off collection (excludes staged cases and scans)</p>
        </div>
        {data.oneOffDays.length === 0 ? (
          <p className="px-5 py-4 text-center text-sm text-slate-400">No one-off treatments this month</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.oneOffDays.map(d => (
                <tr key={d.date} className="border-b border-slate-50">
                  <td className="px-5 py-2 text-slate-700 tabular-nums">{prettyDate(d.date)}</td>
                  <td className="px-5 py-2 tabular-nums text-right w-40">{RM(d.amount)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="px-5 py-2.5 font-bold text-slate-900 uppercase text-xs tracking-wide">One-Off Total</td>
                <td className="px-5 py-2.5 tabular-nums text-right font-bold text-slate-900">{RM(data.oneOffTotal)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400 px-1">
        Professional Fee = Total gross collection × the doctor&apos;s share. Scans pay a flat rate per scan
        (configurable in <Link href="/config/payout-rules" className="text-blue-600 hover:underline">Settings → Payout Rules</Link>),
        added on top.
      </p>
    </div>
  );
}

/** e.g. "1/7" (day/month, MYT) */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+08:00`);
  return `${d.toLocaleDateString("en-MY", { day: "numeric", timeZone: "Asia/Kuala_Lumpur" })}/${d.toLocaleDateString("en-MY", { month: "numeric", timeZone: "Asia/Kuala_Lumpur" })}`;
}
