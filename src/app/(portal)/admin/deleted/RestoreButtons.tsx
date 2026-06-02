"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RestoreButtons({
  type, id, label,
}: {
  type: "patient" | "visit" | "invoice";
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    if (!confirm(`Restore ${type} "${label}"?`)) return;
    setLoading(true);
    await fetch("/api/admin/deleted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
    >
      {loading ? "Restoring…" : "Restore"}
    </button>
  );
}
