"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InitialStorefrontData } from "./initial-data";

const StorefrontInitialDataContext = createContext<InitialStorefrontData | null>(null);

export function StorefrontInitialDataProvider({
  data,
  children,
}: {
  data: InitialStorefrontData;
  children: ReactNode;
}) {
  return (
    <StorefrontInitialDataContext.Provider value={data}>
      {children}
    </StorefrontInitialDataContext.Provider>
  );
}

export function useStorefrontInitialData() {
  return useContext(StorefrontInitialDataContext);
}
