"use client";

import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";

type Clinic = { id: string; name: string };

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"];
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

// ── Donut (pure SVG) ────────────────────────────────────────────────────────
function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const R = 70, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 180 180" className="w-44 h-44 -rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * C;
          const seg = (
            <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="28" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} />
          );
          acc += frac;
          return seg;
        })}
      </svg>
      <div className="space-y-1 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-slate-700">{d.label}</span>
            <span className="text-slate-400">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bars ────────────────────────────────────────────────────────────────────
function Bars({ data, horizontal }: { data: { label: string; value: number }[]; horizontal?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (horizontal) {
    return (
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate text-slate-600 text-right">{d.label}</span>
            <div className="flex-1 bg-slate-100 rounded h-5 relative">
              <div className="h-5 rounded" style={{ width: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
            </div>
            <span className="w-8 text-slate-500">{d.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2 h-44">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end">
          <span className="text-xs text-slate-500 mb-1">{d.value}</span>
          <div className="w-full rounded-t" style={{ height: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length], minHeight: d.value ? 2 : 0 }} />
          <span className="text-[10px] text-slate-400 mt-1 text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

export function PatientAnalyticsClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState("");
  const [range, setRange]       = useState("all");
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [citySearch, setCitySearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (clinicId) q.set("clinicId", clinicId);
    q.set("dateRange", range);
    fetch(`/api/reports/patients/summary?${q}`).then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [clinicId, range]);

  const clinicName = clinics.find((c) => c.id === clinicId)?.name ?? "All Clinics";

  function exportXlsx() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.source.breakdown.map((b: any) => ({ Source: b.sourceName, Count: b.count, "%": b.percentage, "Trend %": b.trend }))
    ), "Sources");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.age.breakdown.map((b: any) => ({ "Age Group": b.group, Label: b.label, Count: b.count, "%": b.percentage }))
    ), "Age");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.address.byState.map((b: any) => ({ State: b.state, Count: b.count, "%": b.percentage }))
    ), "Address");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.gender.breakdown.map((b: any) => ({ Gender: b.label, Count: b.count, "%": b.percentage }))
    ), "Gender");
    XLSX.writeFile(wb, `Patient-Analytics-${clinicName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const filteredCities = useMemo(
    () => (data?.address.byCity ?? []).filter((c: any) => c.city.toLowerCase().includes(citySearch.toLowerCase())),
    [data, citySearch]
  );

  if (loading || !data) return <div className="p-8 text-slate-400">Loading analytics…</div>;

  const src = data.source, age = data.age, addr = data.address, gen = data.gender;
  const largestAge = age.breakdown.filter((b: any) => b.group !== "unknown").reduce((a: any, b: any) => b.count > (a?.count ?? -1) ? b : a, null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Patient Analytics</h1>
        <div className="flex items-center gap-2">
          <select className="form-input text-sm py-1.5 w-40" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All Clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input text-sm py-1.5 w-36" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
          </select>
          <button onClick={exportXlsx} className="btn-primary text-sm py-1.5">Export Excel</button>
        </div>
      </div>

      {/* SECTION 1 — Sources */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Patient Sources <span className="text-slate-400 text-sm">({src.total} patients)</span></h2>
        {src.breakdown.length === 0 ? <p className="text-slate-400 text-sm">No data.</p> : (
          <div className="grid md:grid-cols-2 gap-6">
            <Donut data={src.breakdown.map((b: any) => ({ label: b.sourceName, value: b.count }))} />
            <table className="w-full text-sm self-start">
              <thead><tr className="text-xs text-slate-400 uppercase border-b">
                <th className="text-left py-1">Source</th><th className="text-right py-1">Count</th><th className="text-right py-1">%</th><th className="text-right py-1">Trend</th>
              </tr></thead>
              <tbody>
                {src.breakdown.map((b: any) => (
                  <tr key={b.sourceId} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-700">{b.sourceName}</td>
                    <td className="py-1.5 text-right">{b.count}</td>
                    <td className="py-1.5 text-right text-slate-500">{b.percentage}%</td>
                    <td className={`py-1.5 text-right ${b.trend > 0 ? "text-green-600" : b.trend < 0 ? "text-red-500" : "text-slate-400"}`}>
                      {b.trend > 0 ? "↑" : b.trend < 0 ? "↓" : ""}{Math.abs(b.trend)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Referral breakdown */}
        {src.referralBreakdown && src.referralBreakdown.byType.some((t: any) => t.count > 0) && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-3">Referral Breakdown</p>
            <div className="grid md:grid-cols-2 gap-6">
              <Bars horizontal data={src.referralBreakdown.byType.map((t: any) => ({ label: t.label, value: t.count }))} />
              <div className="space-y-3 text-sm">
                {src.referralBreakdown.topReferringDoctors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Top Doctors</p>
                    {src.referralBreakdown.topReferringDoctors.slice(0, 5).map((d: any) => (
                      <div key={d.doctorId} className="flex justify-between"><span>{d.doctorName}</span><span className="text-slate-400">{d.referralCount} · {RM(d.totalCommission)}</span></div>
                    ))}
                  </div>
                )}
                {src.referralBreakdown.topReferringPatients.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Top Patients</p>
                    {src.referralBreakdown.topReferringPatients.slice(0, 5).map((p: any) => (
                      <div key={p.patientId} className="flex justify-between"><span>{p.patientName}</span><span className="text-slate-400">{p.referralCount}</span></div>
                    ))}
                  </div>
                )}
                {src.referralBreakdown.topExternalReferrers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Top External</p>
                    {src.referralBreakdown.topExternalReferrers.slice(0, 5).map((e: any, i: number) => (
                      <div key={i} className="flex justify-between"><span>{e.externalName} <span className="text-slate-300">({e.externalReferrerType})</span></span><span className="text-slate-400">{e.referralCount}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2 — Age */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Age Analysis</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Average Age" value={age.averageAge} />
          <Stat label="Median Age" value={age.medianAge} />
          <Stat label="Youngest" value={age.youngest} />
          <Stat label="Oldest" value={age.oldest} />
        </div>
        <Bars data={age.breakdown.filter((b: any) => b.group !== "unknown").map((b: any) => ({ label: b.group, value: b.count }))} />
        <table className="w-full text-sm mt-5">
          <thead><tr className="text-xs text-slate-400 uppercase border-b"><th className="text-left py-1">Age Group</th><th className="text-left py-1">Label</th><th className="text-right py-1">Count</th><th className="text-right py-1">%</th></tr></thead>
          <tbody>
            {age.breakdown.map((b: any) => (
              <tr key={b.group} className={`border-b border-slate-50 ${largestAge && b.group === largestAge.group ? "bg-blue-50" : ""}`}>
                <td className="py-1.5">{b.group}</td><td className="py-1.5 text-slate-500">{b.label}</td>
                <td className="py-1.5 text-right">{b.count}</td><td className="py-1.5 text-right text-slate-500">{b.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 3 — Address */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Address Analysis</h2>
        <div className={`mb-4 text-sm rounded-md px-3 py-2 ${addr.coveragePercentage < 50 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-50 text-slate-600"}`}>
          {addr.withAddress} of {addr.total} patients have an address on file ({addr.coveragePercentage}%)
          {addr.coveragePercentage < 50 && <span className="block text-xs mt-0.5">Consider collecting address during registration</span>}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">By State</p>
            <Bars horizontal data={addr.byState.slice(0, 16).map((s: any) => ({ label: s.state, value: s.count }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">By City (top 20)</p>
              <input className="form-input text-xs py-1 w-32" placeholder="Search…" value={citySearch} onChange={(e) => setCitySearch(e.target.value)} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-400 uppercase border-b"><th className="text-left py-1">City</th><th className="text-left py-1">State</th><th className="text-right py-1">Count</th></tr></thead>
              <tbody>
                {filteredCities.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50"><td className="py-1.5">{c.city}</td><td className="py-1.5 text-slate-500">{c.state}</td><td className="py-1.5 text-right">{c.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 4 — Gender */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Gender Analysis</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Donut data={gen.breakdown.filter((b: any) => b.count > 0).map((b: any) => ({ label: b.label, value: b.count }))} />
          <table className="w-full text-sm self-start">
            <thead><tr className="text-xs text-slate-400 uppercase border-b"><th className="text-left py-1">Gender</th><th className="text-right py-1">Count</th><th className="text-right py-1">%</th></tr></thead>
            <tbody>
              {gen.breakdown.map((b: any) => (
                <tr key={b.gender} className="border-b border-slate-50"><td className="py-1.5">{b.label}</td><td className="py-1.5 text-right">{b.count}</td><td className="py-1.5 text-right text-slate-500">{b.percentage}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
