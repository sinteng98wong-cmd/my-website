"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export function DepositBalanceBadge({ patientId }: { patientId: string }) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/patients/${patientId}/deposits/balance`)
      .then(r => r.json())
      .then(d => setBalance(d.balance ?? 0))
      .catch(() => setBalance(0));
  }, [patientId]);

  if (balance === null) return null;

  return (
    <Link
      href={`/patients/${patientId}?tab=deposit`}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border transition-colors
        ${balance > 0
          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
          : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
        }`}
    >
      <span>💰</span>
      <span>Deposit {RM(balance)}</span>
    </Link>
  );
}
