"use client";

type Clinic = { id: string; name: string };

export function ClinicFilter({
  clinics,
  selected,
}: {
  clinics: Clinic[];
  selected: string | undefined;
}) {
  return (
    <form method="get" className="flex items-center gap-2">
      <label className="text-sm text-slate-500">Clinic:</label>
      <select
        name="clinicId"
        className="input text-sm"
        defaultValue={selected ?? ""}
        onChange={(e) => e.currentTarget.form?.submit()}
      >
        <option value="">All clinics</option>
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  );
}
