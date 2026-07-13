"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Stethoscope, HeartPulse, ChevronLeft, ChevronRight, Users, X, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };
type Staff  = { id: string; name: string };
type Shift = {
  id: string;
  startTime: string;
  endTime: string;
  status: "PENDING" | "APPROVED";
  user: { id: string; name: string; role: string };
  branch: { id: string; name: string };
};
type RoleTab = "DOCTOR" | "NURSE";

interface Props {
  branches:         Branch[];
  initialWeekStart: string; // YYYY-MM-DD (Monday)
  canEdit:          boolean;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_START = "09:00";
const DEFAULT_END   = "17:00";

// ─── Date helpers (MYT) ────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); // YYYY-MM-DD
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });

/** HH:MM (MYT) of an ISO datetime */
function timeOfDay(iso: string): string {
  return fmtTime(iso);
}
/** Build a MYT datetime ISO from a day + HH:MM */
function atMYT(dayISO: string, hhmm: string): string {
  return new Date(`${dayISO}T${hhmm}:00+08:00`).toISOString();
}
function addDays(dayISO: string, n: number): string {
  const d = new Date(`${dayISO}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}
function prettyDay(dayISO: string): string {
  return new Date(`${dayISO}T00:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function WeeklyRosterClient({ branches, initialWeekStart, canEdit }: Props) {
  const [tab, setTab]             = useState<RoleTab>("DOCTOR");
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [branchId, setBranchId]   = useState(branches[0]?.id ?? "");
  const [shifts, setShifts]       = useState<Shift[]>([]);
  const [staff, setStaff]         = useState<Staff[]>([]);
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [reassign, setReassign]   = useState<{ userId: string; name: string; dayISO: string } | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const activeBranch = branches.find(b => b.id === branchId);

  const flash = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/shifts?weekStart=${weekStart}&role=${tab}`);
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { flash(d.error ?? "Failed to load", false); return; }
    setShifts(d.shifts); setStaff(d.staff);
  }, [weekStart, tab, flash]);

  useEffect(() => { load(); }, [load]);

  // Shifts grouped by day (all branches, so cross-branch pulls are visible)
  const byDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const day of days) m.set(day, []);
    for (const s of shifts) {
      const day = fmtDate(s.startTime);
      if (m.has(day)) m.get(day)!.push(s);
    }
    for (const list of m.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [shifts, days]);

  // Available pool = staff with NO shift anywhere this week
  const rosteredIds = useMemo(() => new Set(shifts.map(s => s.user.id)), [shifts]);
  const pool = useMemo(() => staff.filter(s => !rosteredIds.has(s.id)), [staff, rosteredIds]);

  // ── Drag handling ────────────────────────────────────────────────────────
  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination || !canEdit) return;
    const srcId = source.droppableId, dstId = destination.droppableId;
    if (srcId === dstId) return;

    // Pull from pool → a day: confirm, then create at the active branch
    if (srcId === "pool" && dstId !== "pool") {
      const userId = draggableId.replace("pool-", "");
      const person = pool.find(p => p.id === userId);
      setReassign({ userId, name: person?.name ?? "Staff", dayISO: dstId });
      return;
    }
    // Day → pool: unassign (delete)
    if (dstId === "pool" && srcId !== "pool") {
      await removeShift(draggableId);
      return;
    }
    // Day → another day: move the shift, preserving time-of-day
    if (srcId !== "pool" && dstId !== "pool") {
      await moveShift(draggableId, dstId);
    }
  }

  async function moveShift(shiftId: string, destDayISO: string) {
    const s = shifts.find(x => x.id === shiftId);
    if (!s) return;
    const startISO = atMYT(destDayISO, timeOfDay(s.startTime));
    const endISO   = atMYT(destDayISO, timeOfDay(s.endTime));
    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: startISO, endTime: endISO }),
    });
    const d = await res.json();
    if (!res.ok) { flash(d.error ?? "Move failed", false); return; }
    flash(`Moved ${s.user.name} to ${prettyDay(destDayISO)}`, true);
    load();
  }

  async function confirmReassign() {
    if (!reassign) return;
    const { userId, name, dayISO } = reassign;
    setReassign(null);
    const res = await fetch("/api/shifts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, branchId,
        startTime: atMYT(dayISO, DEFAULT_START),
        endTime:   atMYT(dayISO, DEFAULT_END),
      }),
    });
    const d = await res.json();
    if (!res.ok) { flash(d.error ?? "Assignment failed", false); return; }
    flash(`${name} rostered at ${activeBranch?.name} on ${prettyDay(dayISO)}`, true);
    load();
  }

  async function removeShift(shiftId: string) {
    const res = await fetch(`/api/shifts/${shiftId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); flash(d.error ?? "Remove failed", false); return; }
    flash("Shift removed", true);
    load();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Role tabs */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
          <button onClick={() => setTab("DOCTOR")}
            className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "DOCTOR" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            <Stethoscope size={14} /> Doctor Schedule
          </button>
          <button onClick={() => setTab("NURSE")}
            className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${tab === "NURSE" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            <HeartPulse size={14} /> Nurse Schedule
          </button>
        </div>

        {/* Branch filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">Branch</label>
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="form-input w-auto text-sm py-1.5">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-secondary text-xs p-1.5"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium text-slate-700 px-2 tabular-nums">
            {prettyDay(days[0])} – {prettyDay(days[6])}
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-secondary text-xs p-1.5"><ChevronRight size={16} /></button>
          <button onClick={() => setWeekStart(initialWeekStart)} className="btn-secondary text-xs ml-1">This week</button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${toast.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {!toast.ok && <AlertCircle size={15} />}{toast.msg}
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4">
          {/* 7-day board */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 min-w-0">
            {days.map((day, i) => (
              <Droppable droppableId={day} key={day}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    className={`rounded-xl border min-h-[9rem] flex flex-col ${snapshot.isDraggingOver ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white"}`}>
                    <div className="px-2.5 py-2 border-b border-slate-100 sticky top-0">
                      <p className="text-xs font-semibold text-slate-700">{DAY_NAMES[i]}</p>
                      <p className="text-[10px] text-slate-400">{prettyDay(day)}</p>
                    </div>
                    <div className="p-1.5 space-y-1.5 flex-1">
                      {(byDay.get(day) ?? []).map((s, idx) => (
                        <Draggable draggableId={s.id} index={idx} key={s.id} isDragDisabled={!canEdit}>
                          {(dp, snap) => {
                            const pulled = s.branch.id !== branchId;
                            return (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}
                                className={`rounded-lg px-2 py-1.5 text-xs shadow-sm border transition-shadow ${snap.isDragging ? "shadow-md" : ""} ${
                                  pulled ? "bg-amber-50 border-amber-300" : "bg-indigo-50 border-indigo-200"
                                }`}>
                                <p className="font-medium text-slate-800 truncate">{s.user.name}</p>
                                <p className="text-[10px] text-slate-500 tabular-nums">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</p>
                                {pulled ? (
                                  <span className="inline-block mt-0.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">→ {s.branch.name}</span>
                                ) : (
                                  s.status === "APPROVED"
                                    ? <span className="inline-block mt-0.5 text-[9px] text-green-700 bg-green-100 rounded px-1 py-0.5">Approved</span>
                                    : <span className="inline-block mt-0.5 text-[9px] text-slate-500 bg-slate-100 rounded px-1 py-0.5">Pending</span>
                                )}
                              </div>
                            );
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>

          {/* Available staff pool */}
          <Droppable droppableId="pool">
            {(provided, snapshot) => (
              <div ref={provided.innerRef} {...provided.droppableProps}
                className={`w-48 flex-shrink-0 rounded-xl border p-2.5 ${snapshot.isDraggingOver ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <Users size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-600">Available Staff</p>
                </div>
                <p className="text-[10px] text-slate-400 px-1 mb-2">Not rostered this week — drag into a day to assign.</p>
                <div className="space-y-1.5">
                  {pool.map((p, idx) => (
                    <Draggable draggableId={`pool-${p.id}`} index={idx} key={p.id} isDragDisabled={!canEdit}>
                      {(dp, snap) => (
                        <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}
                          className={`rounded-lg px-2.5 py-2 text-xs bg-white border border-slate-200 shadow-sm ${snap.isDragging ? "shadow-md" : ""}`}>
                          <p className="font-medium text-slate-700 truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-400">{tab === "DOCTOR" ? "Doctor" : "Nurse"}</p>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {pool.length === 0 && <p className="text-[11px] text-slate-400 px-1 py-2">Everyone is rostered.</p>}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {loading && <p className="text-xs text-slate-400">Loading…</p>}

      {/* Reassign confirmation modal */}
      {reassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-slate-900">Confirm reassignment</h3>
              <button onClick={() => setReassign(null)} className="text-slate-300 hover:text-slate-500"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to reassign <strong>{reassign.name}</strong> to <strong>{activeBranch?.name}</strong> for a shift
              on <strong>{prettyDay(reassign.dayISO)}</strong> ({DEFAULT_START}–{DEFAULT_END})?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setReassign(null)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={confirmReassign} className="btn-primary text-sm">Confirm & Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
