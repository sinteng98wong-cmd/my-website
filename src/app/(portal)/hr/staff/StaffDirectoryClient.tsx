"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PROBATION: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-red-100 text-red-700",
  RESIGNED: "bg-slate-100 text-slate-400",
  TERMINATED: "bg-slate-100 text-slate-400",
  RETIRED: "bg-slate-100 text-slate-400",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function AvatarCircle({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-16 h-16 text-xl" : size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const colors = ["bg-blue-500","bg-green-500","bg-purple-500","bg-rose-500","bg-amber-500","bg-teal-500"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>{initials(name)}</div>;
}

export function StaffDirectoryClient({ clinics, isSuperAdmin }: { clinics: Clinic[]; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (clinicId) params.set("clinicId", clinicId);
    if (search) params.set("search", search);
    if (statusFilter) params.set("employmentStatus", statusFilter);
    if (typeFilter) params.set("employmentType", typeFilter);
    const d = await fetch(`/api/hr/staff?${params}`).then(r => r.json()).catch(() => []);
    setStaff(Array.isArray(d) ? d : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clinicId, statusFilter, typeFilter]);

  const filtered = staff.filter(s => !search || s.user.name.toLowerCase().includes(search.toLowerCase()) || (s.employeeId ?? "").includes(search) || (s.phone ?? "").includes(search));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Staff Directory</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="form-input w-40 text-sm" value={clinicId} onChange={e => setClinicId(e.target.value)}>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="form-input w-44 text-sm" placeholder="Search name / ID / phone…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} />
          <select className="form-input w-32 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["ACTIVE","PROBATION","SUSPENDED","RESIGNED","TERMINATED"].map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="form-input w-36 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {["FULL_TIME","PART_TIME","CONTRACT","LOCUM","INTERN"].map(t => <option key={t}>{t.replace("_"," ")}</option>)}
          </select>
          <div className="flex rounded border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => setView("table")} className={`px-3 py-1.5 ${view === "table" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Table</button>
            <button onClick={() => setView("grid")} className={`px-3 py-1.5 ${view === "grid" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Grid</button>
          </div>
          <button onClick={() => router.push("/hr/staff/new")} className="btn-primary text-sm">+ Add Staff</button>
        </div>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="card p-12 text-center text-slate-400">
          <p className="text-lg mb-1">No staff found.</p>
          <p className="text-sm">Add your first staff member using the button above.</p>
        </div>
      )}

      {view === "table" && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>{["Employee ID","Name","Role","Clinic","Type","Status","Join Date",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const resigned = ["RESIGNED","TERMINATED"].includes(s.employmentStatus);
                return (
                  <tr key={s.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/staff/${s.id}`)}>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{s.employeeId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AvatarCircle name={s.user.name} size="sm" />
                        <span className={`font-medium ${resigned ? "line-through text-slate-400" : ""}`}>{s.user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{s.user.role}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{clinics.find(c => c.id === s.clinicId)?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{s.employmentType?.replace("_"," ")}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[s.employmentStatus] ?? ""}`}>{s.employmentStatus}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{s.joinDate ? new Date(s.joinDate).toLocaleDateString("en-MY") : "—"}</td>
                    <td className="px-4 py-3 text-blue-600 text-xs">View →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map(s => (
            <div key={s.id} className="card p-5 flex flex-col items-center text-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/hr/staff/${s.id}`)}>
              <AvatarCircle name={s.user.name} size="lg" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">{s.user.name}</p>
                <p className="text-xs text-slate-400">{s.employeeId ?? "No ID"}</p>
                <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${STATUS_CLASS[s.employmentStatus] ?? ""}`}>{s.employmentStatus}</span>
              </div>
              <p className="text-xs text-slate-500">{s.user.role}</p>
              <p className="text-xs text-slate-400">{clinics.find(c => c.id === s.clinicId)?.name}</p>
              <div className="flex gap-2 mt-auto text-xs text-blue-600">
                <a href={`/hr/staff/${s.id}`} onClick={e => e.stopPropagation()}>Profile</a>
                <span className="text-slate-300">·</span>
                <a href={`/hr/leave?staffProfileId=${s.id}`} onClick={e => e.stopPropagation()}>Leave</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
