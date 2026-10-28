/** Small presentation-only snapshot owner; a colony replacement invalidates old controls. */
export function discardSpotlightReturn<T>(snapshot: { current: T | null }): void {
  snapshot.current = null;
}

/** Consume at most once: a scene completion must never restore the same controls twice. */
export function takeSpotlightReturn<T>(snapshot: { current: T | null }): T | null {
  const prior = snapshot.current;
  snapshot.current = null;
  return prior;
}
