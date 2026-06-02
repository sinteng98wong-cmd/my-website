"use client";

export function ExportButtons({ month, clinicId }: { month: string; clinicId?: string }) {
  function buildUrl(format: string) {
    const params = new URLSearchParams({ month, format });
    if (clinicId) params.set("clinicId", clinicId);
    return `/api/ledger/export?${params}`;
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={buildUrl("csv")}
        download
        className="btn-outline text-sm flex items-center gap-1.5"
      >
        ↓ CSV
      </a>
      <a
        href={buildUrl("pdf")}
        download
        className="btn-primary text-sm flex items-center gap-1.5"
      >
        ↓ PDF
      </a>
    </div>
  );
}
