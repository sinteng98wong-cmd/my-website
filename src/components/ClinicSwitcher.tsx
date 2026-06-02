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
    <div className="px-3 pb-2">
      <select
        defaultValue={selected ?? "all"}
        onChange={handleChange}
        className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Branches</option>
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
