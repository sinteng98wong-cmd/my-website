"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ModuleKey } from "@/lib/modules";

type ClinicAccess = {
  clinicId:        string;
  clinicName:      string;
  effectiveRole:   string;
  isRoleOverridden: boolean;
  modules:         Record<string, boolean>;
};

type AccessContextValue = {
  loading:           boolean;
  activeClinicId:    string | null;
  setActiveClinicId: (id: string) => void;
  canAccess:         (module: ModuleKey) => boolean;
  effectiveRole:     string;
  isRoleOverridden:  boolean;
  clinicAccess:      ClinicAccess[];
  refetch:           () => void;
};

const Ctx = createContext<AccessContextValue>({
  loading: true,
  activeClinicId: null,
  setActiveClinicId: () => {},
  canAccess: () => false,
  effectiveRole: "",
  isRoleOverridden: false,
  clinicAccess: [],
  refetch: () => {},
});

function parseCookieClinicId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;)\s*selected_clinic=([^;]+)/);
  const val   = match?.[1];
  return val && val !== "all" ? val : null;
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading]         = useState(true);
  const [clinicAccess, setClinicAccess] = useState<ClinicAccess[]>([]);
  const [activeClinicId, setActive]   = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/me/access");
      if (!res.ok) return;
      const data = await res.json() as ClinicAccess[];
      setClinicAccess(data);
      // Sync with cookie
      const cookieClinic = parseCookieClinicId();
      const match        = data.find(c => c.clinicId === cookieClinic);
      setActive(match?.clinicId ?? data[0]?.clinicId ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  function setActiveClinicId(id: string) {
    setActive(id);
    // Sync cookie
    document.cookie = `selected_clinic=${id};path=/;max-age=86400`;
  }

  const active        = clinicAccess.find(c => c.clinicId === activeClinicId);
  const effectiveRole = active?.effectiveRole ?? "";
  const isRoleOverridden = active?.isRoleOverridden ?? false;

  function canAccess(module: ModuleKey): boolean {
    if (!active) return false;
    return active.modules[module] ?? false;
  }

  return (
    <Ctx.Provider value={{
      loading, activeClinicId, setActiveClinicId,
      canAccess, effectiveRole, isRoleOverridden,
      clinicAccess, refetch: fetch_,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccess() {
  return useContext(Ctx);
}
