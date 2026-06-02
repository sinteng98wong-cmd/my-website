"use client";

import { useEffect, useState } from "react";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
const STATUS_BADGE: Record<string, string> = { PLANNED:"bg-blue-100 text-blue-700", ONGOING:"bg-amber-100 text-amber-700", COMPLETED:"bg-green-100 text-green-700", CANCELLED:"bg-slate-100 text-slate-500" };

export function MyTrainingClient() {
  const [trainings, setTrainings] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/hr/training").then((r) => r.json()).then((d) => setTrainings(Array.isArray(d) ? d : []));
  }, []);

  const completed = trainings.filter((t) => t.status === "COMPLETED");
  const ongoing = trainings.filter((t) => t.status === "ONGOING");
  const planned = trainings.filter((t) => t.status === "PLANNED");

  function TrainingCard({ t }: { t: any }) {
    return (
      <div className="card p-4 space-y-2">
        <div className="flex justify-between items-start">
          <h3 className="font-medium text-slate-800">{t.training?.title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[t.status]}`}>{t.status}</span>
        </div>
        <p className="text-xs text-slate-500">{t.training?.provider} · {t.training?.type}</p>
        <p className="text-xs text-slate-400">{fmtDate(t.training?.startDate)} – {fmtDate(t.training?.endDate)}</p>
        {t.training?.venue && <p className="text-xs text-slate-400">📍 {t.training.venue}</p>}
        {t.score != null && <p className="text-xs text-slate-600">Score: <span className="font-medium">{t.score}</span></p>}
        {t.certificateUrl && <a href={t.certificateUrl} target="_blank" className="text-xs text-blue-600 hover:underline">📄 Download Certificate</a>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">My Training History</h1>
        <a href="/hr/training" className="btn-secondary text-sm">All Trainings</a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-700">{completed.length}</p>
          <p className="text-sm text-green-600">Completed</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-amber-700">{ongoing.length}</p>
          <p className="text-sm text-amber-600">Ongoing</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{planned.length}</p>
          <p className="text-sm text-blue-600">Planned</p>
        </div>
      </div>

      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">Completed</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completed.map((t) => <TrainingCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {ongoing.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">Ongoing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ongoing.map((t) => <TrainingCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {planned.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-700">Upcoming / Planned</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {planned.map((t) => <TrainingCard key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {trainings.length === 0 && <div className="text-center text-slate-400 py-12">No training records yet.</div>}
    </div>
  );
}
