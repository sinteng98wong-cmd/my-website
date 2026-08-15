"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { canReviewOpening } from "@/lib/stock-opening";

type Clinic = { id: string; name: string };
type Item   = { id: string; name: string; sku: string; unit: string | null };

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const STATUS: Record<string, string> = {
  DRAFT:     "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-amber-100 text-amber-700",
  APPROVED:  "bg-green-100 text-green-700",
  REJECTED:  "bg-red-100 text-red-700",
};

export function OpeningBalanceListClient({ clinics, role }: { clinics: Clinic[]; role: string }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [status, setStatus]     = useState("");
  const [docs, setDocs]         = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [items, setItems]       = useState<Item[]>([]);
  const [picked, setPicked]     = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (clinicId) q.set("clinicId", clinicId);
    if (status)   q.set("status", status);
    const d = await fetch(`/api/stock-opening?${q}`).then((r) => r.json());
    setDocs(Array.isArray(d) ? d : []);
  }, [clinicId, status]);

  useEffect(() => { load(); }, [load]);

  async function openCreate() {
    setCreating(true); setError(""); setPicked(new Set());
    const d = await fetch("/api/inventory/items").then((r) => r.json()).catch(() => []);
    setItems(Array.isArray(d) ? d : []);
  }

  async function create() {
    if (picked.size === 0) { setError("Select the items that have opening stock."); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/stock-opening", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId, itemIds: [...picked] }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not create the document"); return; }
    router.push(`/inventory/opening-balance/${d.id}`);
  }

  const shown = items.filter(
    (i) => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Opening Balance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Establishes each item&rsquo;s first ledger position from a physical count. Approved figures
            become immutable history.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <select className="form-input w-auto text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input w-auto text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={openCreate} className="btn-primary text-sm whitespace-nowrap">New Opening Balance</button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

      {creating && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-700">Select items with opening stock</h2>
            <button onClick={() => setCreating(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
          <p className="text-xs text-slate-500">
            Only add items the branch actually holds. Items left out simply have no opening position —
            nothing is created for them.
          </p>
          <input
            className="form-input text-sm" placeholder="Search by name or SKU…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
            {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">No items.</p>}
            {shown.map((i) => (
              <label key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox" checked={picked.has(i.id)}
                  onChange={(e) => setPicked((p) => {
                    const n = new Set(p);
                    e.target.checked ? n.add(i.id) : n.delete(i.id);
                    return n;
                  })}
                />
                <span className="flex-1">{i.name}</span>
                <span className="text-xs text-slate-400 font-mono">{i.sku}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{picked.size} selected</span>
            <button onClick={create} disabled={busy} className="btn-primary text-sm">
              {busy ? "Creating…" : "Create Draft"}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Reference", "Branch", "Items", "Total Qty", "Total Value", "Status", "Raised by", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                No opening balances yet. Create one when the branch has completed its physical count.
              </td></tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="table-row cursor-pointer" onClick={() => router.push(`/inventory/opening-balance/${d.id}`)}>
                <td className="px-4 py-3 font-mono text-xs">{d.reference}</td>
                <td className="px-4 py-3 text-slate-600">{d.clinic.name}</td>
                <td className="px-4 py-3 text-center">{d._count.lines}</td>
                <td className="px-4 py-3 text-right">{d.totalQuantity}</td>
                <td className="px-4 py-3 text-right font-mono">{RM(d.totalValue)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS[d.status]}`}>{d.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{d.createdBy?.name}</td>
                <td className="px-4 py-3 text-blue-600 text-xs whitespace-nowrap">
                  {d.status === "SUBMITTED" && canReviewOpening(role) ? "Review →" : "View →"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
