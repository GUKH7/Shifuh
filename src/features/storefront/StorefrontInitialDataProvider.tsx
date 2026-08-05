"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicStorefrontData } from "./public-storefront-types";

const StorefrontInitialDataContext = createContext<PublicStorefrontData | undefined>(undefined);

export function StorefrontInitialDataProvider({
  data,
  children,
}: {
  data: PublicStorefrontData;
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
