import { createContext, useContext, type ReactNode } from "react";

import type { Engine } from "./engine";

const EngineContext = createContext<Engine | null>(null);

export const EngineProvider = ({ engine, children }: { engine: Engine; children: ReactNode }) => (
  <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
);

export const useEngine = () => {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngine needs an EngineProvider");
  return engine;
};
