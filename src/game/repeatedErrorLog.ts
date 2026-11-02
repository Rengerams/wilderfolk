/** Pure throttle decision for repeated worker faults; the host owns the I/O around it. */
export interface RepeatedErrorState {
  message: string;
  at: number;
  suppressed: number;
}

export interface RepeatedErrorDecision {
  log: boolean;
  suppressed: number;
}

/** Log the first fault, count identical ones inside the window, and log again once it expires. */
export function decideRepeatedError(
  previous: RepeatedErrorState | null,
  message: string,
  now: number,
  windowMs: number,
): RepeatedErrorDecision {
  if (previous && previous.message === message && now - previous.at < windowMs) {
    return { log: false, suppressed: previous.suppressed + 1 };
  }
  return { log: true, suppressed: previous?.suppressed ?? 0 };
}
