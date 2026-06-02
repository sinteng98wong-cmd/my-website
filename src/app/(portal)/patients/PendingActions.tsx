"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PendingActions({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    await fetch(`/api/patients/${patientId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    router.refresh();
  }
  async function reject() {
    const reason = prompt("Reason for rejecting this registration?");
    if (reason === null) return;
    setBusy(true);
    await fetch(`/api/patients/${patientId}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-2 text-xs">
      <button onClick={confirm} disabled={busy} className="text-green-600 hover:underline disabled:opacity-50">Confirm</button>
      <button onClick={reject} disabled={busy} className="text-red-500 hover:underline disabled:opacity-50">Reject</button>
    </div>
  );
}
