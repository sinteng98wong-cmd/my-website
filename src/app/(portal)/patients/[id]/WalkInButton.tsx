"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WalkInButton({ patientId, clinicId }: { patientId: string; clinicId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleWalkIn() {
    setLoading(true);
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, clinicId }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) router.push(`/visits/${data.id}`);
  }

  return (
    <button onClick={handleWalkIn} disabled={loading} className="btn-primary text-sm">
      {loading ? "Creating…" : "Walk-In Visit"}
    </button>
  );
}
