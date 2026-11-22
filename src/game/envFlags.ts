/**
 * Boolean environment flags. One owner for reading a build-time `VITE_*` value or a runtime
 * `process.env` value, so every reader agrees on what "on" and "off" mean.
 */

/** Affirmative spellings of a boolean flag. */
export const FLAG_ON = /^(1|true|yes|on|enabled)$/i;

/** Negative spellings of a boolean flag. */
export const FLAG_OFF = /^(0|false|no|off|disabled)$/i;

/** The runtime (`process.env`) value of a flag, where a process exists. */
export function runtimeEnvFlag(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name];
}

/** True when the flag value matches the given spelling set; unset or empty is never a match. */
export function envFlagMatches(value: string | undefined, pattern: RegExp): boolean {
  if (value == null || value === '') return false;
  return pattern.test(value.trim());
}

/** True when the runtime or the build-time value of a flag is affirmatively set. */
export function envFlagOn(name: string, buildValue: string | undefined): boolean {
  return envFlagMatches(runtimeEnvFlag(name), FLAG_ON) || envFlagMatches(buildValue, FLAG_ON);
}
