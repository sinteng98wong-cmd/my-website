"use client";

export function DetailExportButtons({
  from,
  to,
  clinicId,
}: {
  from: string;
  to: string;
  clinicId?: string;
}) {
  function buildUrl(format: string) {
    const params = new URLSearchParams({ from, to, format });
    if (clinicId) params.set("clinicId", clinicId);
    return `/api/ledger/detail-export?${params}`;
  }

  return (
    <div className="flex items-center gap-2 self-end">
      <a href={buildUrl("csv")} download className="btn-outline text-sm flex items-center gap-1.5">
        ↓ CSV
      </a>
      <a href={buildUrl("pdf")} download className="btn-primary text-sm flex items-center gap-1.5">
        ↓ PDF
      </a>
    </div>
  );
}
