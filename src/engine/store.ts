import { useSyncExternalStore } from "react";

/** A tiny observable state container for engine objects. */
export class Store<T extends object> {
  private listeners = new Set<() => void>();
  protected state: T;

  constructor(initial: T) {
    this.state = initial;
  }

  protected set(patch: Partial<T>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;
}

export const useStore = <T extends object>(store: Store<T>) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot);
