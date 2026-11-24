"use client";

import React from "react";
import { LanguageProvider } from "@/lib/i18n/context";
import { VaultSentinelCursor } from "@/components/VaultSentinelCursor";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <VaultSentinelCursor />
      {children}
    </LanguageProvider>
  );
}
