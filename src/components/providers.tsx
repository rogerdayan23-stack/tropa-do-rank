"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" storageKey="tropa-theme">
      {children}
      <Toaster position="bottom-right" richColors />
    </NextThemesProvider>
  );
}
