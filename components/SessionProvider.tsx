"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { AccessProvider } from "@/context/AccessContext";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <AccessProvider>{children}</AccessProvider>
    </NextAuthSessionProvider>
  );
}
