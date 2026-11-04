import { createContext, useContext, type ReactNode } from "react";

import type { CloudSync } from "./sync";

const CloudContext = createContext<CloudSync | null>(null);

export const CloudProvider = ({ cloud, children }: { cloud: CloudSync; children: ReactNode }) => (
  <CloudContext.Provider value={cloud}>{children}</CloudContext.Provider>
);

export const useCloud = () => {
  const cloud = useContext(CloudContext);
  if (!cloud) throw new Error("useCloud needs a CloudProvider");
  return cloud;
};
