"use client";

import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

export function ClinicSwitcher({
  clinics,
  selected,
}: {
  clinics: Clinic[];
  selected: string | undefined;
}) {
  const router = useRouter();

  if (clinics.length <= 1) return null;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await fetch("/api/select-clinic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId: e.target.value }),
    });
    router.refresh();
  }

  return (
    <select
      defaultValue={selected ?? "all"}
      onChange={handleChange}
      className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700/50
                 text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30
                 focus:border-slate-600 transition-colors cursor-pointer"
    >
      <option value="all">All Branches</option>
      {clinics.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
