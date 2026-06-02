"use client";

import { useState, useEffect, useCallback } from "react";

// FDI tooth layout
const UPPER_RIGHT = ["18","17","16","15","14","13","12","11"];
const UPPER_LEFT  = ["21","22","23","24","25","26","27","28"];
const LOWER_LEFT  = ["31","32","33","34","35","36","37","38"];
const LOWER_RIGHT = ["48","47","46","45","44","43","42","41"];

const CONDITIONS = [
  { value: "healthy",   label: "Healthy",   color: "#ffffff", border: "#cbd5e1", text: "#475569" },
  { value: "decayed",   label: "Decayed",   color: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  { value: "filled",    label: "Filled",    color: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  { value: "crowned",   label: "Crowned",   color: "#fef9c3", border: "#eab308", text: "#713f12" },
  { value: "rct",       label: "RCT",       color: "#fce7f3", border: "#ec4899", text: "#9d174d" },
  { value: "extracted", label: "Extracted", color: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  { value: "missing",   label: "Missing",   color: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  { value: "implant",   label: "Implant",   color: "#d1fae5", border: "#10b981", text: "#065f46" },
  { value: "bridge",    label: "Bridge",    color: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" },
  { value: "veneer",    label: "Veneer",    color: "#e0f2fe", border: "#0ea5e9", text: "#0c4a6e" },
  { value: "fractured", label: "Fractured", color: "#fee2e2", border: "#ef4444", text: "#991b1b" },
] as const;

type Condition = (typeof CONDITIONS)[number]["value"];

type ToothRecord = {
  id: string; toothCode: string; condition: Condition;
  notes?: string | null; recordedAt: string; visitId?: string | null;
};
type HistoryRecord = ToothRecord & {
  visit?: { id: string; visitRef: string; visitDate: string } | null;
};

function getConditionStyle(condition: string) {
  return CONDITIONS.find((c) => c.value === condition) ?? CONDITIONS[0];
}

function ToothIcon({ code, condition, onClick, selected }: {
  code: string; condition: string; onClick: () => void; selected: boolean;
}) {
  const style      = getConditionStyle(condition);
  const isMolar    = ["6","7","8"].includes(code[1]);
  const isAbsent   = condition === "extracted" || condition === "missing";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${code} — ${style.label}`}
      className={`relative flex flex-col items-center transition-transform hover:scale-110 ${selected ? "scale-110" : ""}`}
    >
      <div style={{
        backgroundColor: style.color,
        borderColor: selected ? "#2563eb" : style.border,
        borderWidth: selected ? 2 : 1,
        width: isMolar ? 28 : 22,
        height: isMolar ? 32 : 28,
        borderRadius: isMolar ? 5 : 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: selected ? "0 0 0 2px #bfdbfe" : undefined,
        position: "relative", overflow: "hidden",
      }}>
        {isAbsent && (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="1" x2="11" y2="11" stroke="#94a3b8" strokeWidth="2" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="#94a3b8" strokeWidth="2" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 9, lineHeight: 1 }} className="text-xs text-slate-500 mt-0.5">{code}</span>
    </button>
  );
}

export function DentalChart({
  patientId,
  visitId,
}: {
  patientId: string;
  /** If provided, new records will be linked to this visit */
  visitId?: string;
}) {
  // Current state map: toothCode → latest record
  const [chart, setChart]       = useState<Record<string, ToothRecord>>({});
  const [loading, setLoading]   = useState(true);

  // Edit panel state
  const [selected, setSelected] = useState<string | null>(null);
  const [editCond, setEditCond] = useState<Condition>("healthy");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving]     = useState(false);

  // History panel state
  const [historyCode, setHistoryCode]       = useState<string | null>(null);
  const [history, setHistory]               = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchChart = useCallback(() => {
    setLoading(true);
    fetch(`/api/patients/${patientId}/teeth`)
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, ToothRecord>) => {
        setChart(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [patientId]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  function selectTooth(code: string) {
    setHistoryCode(null);
    setHistory([]);
    setSelected(code);
    const existing = chart[code];
    setEditCond(existing?.condition ?? "healthy");
    setEditNote(existing?.notes ?? "");
  }

  async function openHistory(code: string) {
    setSelected(null);
    setHistoryCode(code);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/teeth?toothCode=${code}&history=1`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }

  async function saveTooth() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/patients/${patientId}/teeth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toothCode: selected,
        condition: editCond,
        notes:     editNote || null,
        visitId:   visitId  || null,
      }),
    });
    if (res.ok) {
      const created: ToothRecord = await res.json();
      setChart(prev => ({ ...prev, [selected]: created }));
    }
    setSaving(false);
    setSelected(null);
  }

  function getCondition(code: string): string {
    return chart[code]?.condition ?? "healthy";
  }

  const stats = Object.values(chart).filter(r => r.condition !== "healthy");

  const arch = (codes: string[], label: string, position: "top" | "bottom") => (
    <div className={position === "top" ? "mb-1" : ""}>
      {position === "top" && <p className="text-xs text-slate-400 text-center mb-2">Upper</p>}
      <div className={`flex justify-center items-${position === "top" ? "end" : "start"} gap-1`}>
        {codes.slice(0, 8).map(code => (
          <ToothIcon key={code} code={code} condition={getCondition(code)}
            onClick={() => selectTooth(code)} selected={selected === code} />
        ))}
        <div className="w-px h-8 bg-slate-200 mx-1" />
        {codes.slice(8).map(code => (
          <ToothIcon key={code} code={code} condition={getCondition(code)}
            onClick={() => selectTooth(code)} selected={selected === code} />
        ))}
      </div>
      {position === "bottom" && <p className="text-xs text-slate-400 text-center mt-2">Lower</p>}
    </div>
  );

  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading chart…</div>
      ) : (
        <div className="flex gap-6">
          {/* Main chart */}
          <div className="flex-1 min-w-0">
            {/* Legend */}
            <div className="flex flex-wrap gap-2 mb-4">
              {CONDITIONS.filter(c => c.value !== "healthy").map(c => (
                <span key={c.value} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                  style={{ backgroundColor: c.color, borderColor: c.border, color: c.text }}>
                  {c.label}
                </span>
              ))}
            </div>

            {/* Upper arch */}
            {arch([...UPPER_RIGHT, ...UPPER_LEFT], "Upper", "top")}

            {/* Midline */}
            <div className="flex justify-center my-2">
              <div className="h-px w-64 bg-slate-200" />
            </div>

            {/* Lower arch */}
            {arch([...LOWER_RIGHT, ...LOWER_LEFT], "Lower", "bottom")}

            {/* Summary */}
            {stats.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Noted Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.map(r => {
                    const s = getConditionStyle(r.condition);
                    return (
                      <button key={r.toothCode}
                        onClick={() => openHistory(r.toothCode)}
                        title="Click to view history"
                        type="button"
                        className="text-xs px-2 py-0.5 rounded border hover:ring-1 hover:ring-blue-400 transition-all"
                        style={{ backgroundColor: s.color, borderColor: s.border, color: s.text }}>
                        {r.toothCode} · {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Edit panel */}
          {selected && !historyCode && (
            <div className="w-56 flex-shrink-0 border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-900">Tooth {selected}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHistory(selected)}
                    title="View history"
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    History
                  </button>
                  <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                </div>
              </div>

              <div className="space-y-1 mb-3 max-h-60 overflow-y-auto">
                {CONDITIONS.map(c => (
                  <label key={c.value} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                    <input type="radio" name="condition" value={c.value}
                      checked={editCond === c.value}
                      onChange={() => setEditCond(c.value as Condition)}
                      className="text-blue-600" />
                    <span className="text-xs px-1.5 py-0.5 rounded border"
                      style={{ backgroundColor: c.color, borderColor: c.border, color: c.text }}>
                      {c.label}
                    </span>
                  </label>
                ))}
              </div>

              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Notes…"
                rows={2}
                className="form-input text-xs mb-3 resize-none"
              />

              {visitId && (
                <p className="text-xs text-slate-400 mb-2">Linked to current visit</p>
              )}

              <button type="button" onClick={saveTooth} disabled={saving} className="btn-primary w-full justify-center text-xs">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {/* History panel */}
          {historyCode && (
            <div className="w-64 flex-shrink-0 border border-slate-200 rounded-lg bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Tooth {historyCode} — History</p>
                  <p className="text-xs text-slate-500">{history.length} record{history.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => selectTooth(historyCode)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                  <button type="button" onClick={() => { setHistoryCode(null); setHistory([]); }} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {loadingHistory && (
                  <p className="px-4 py-6 text-center text-slate-400 text-xs">Loading…</p>
                )}
                {!loadingHistory && history.length === 0 && (
                  <p className="px-4 py-6 text-center text-slate-400 text-xs">No history yet</p>
                )}
                {history.map((rec, i) => {
                  const style = getConditionStyle(rec.condition);
                  const isLatest = i === 0;
                  return (
                    <div key={rec.id} className={`px-4 py-3 ${isLatest ? "bg-blue-50" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded border font-medium"
                          style={{ backgroundColor: style.color, borderColor: style.border, color: style.text }}>
                          {style.label}
                        </span>
                        {isLatest && <span className="text-xs text-blue-600 font-medium">Current</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {new Date(rec.recordedAt).toLocaleDateString("en-MY", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </p>
                      {rec.visit && (
                        <p className="text-xs text-slate-400 font-mono">
                          {rec.visit.visitRef} · {new Date(rec.visit.visitDate).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                        </p>
                      )}
                      {rec.notes && (
                        <p className="text-xs text-slate-600 mt-1 italic">{rec.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
