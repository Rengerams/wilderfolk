/** True when running under Node (tsx, vitest node, sim scripts) — not the browser bundle. */
export function isNodeRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof proc?.versions?.node === 'string';
}

/** Read a UTF-8 file relative to the calling module — headless sims cannot use Vite ?raw imports. */
export async function readUtf8RelativeToModule(
  moduleUrl: string,
  ...pathSegments: string[]
): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  try {
    const fsSpec = 'node:fs';
    const pathSpec = 'node:path';
    const urlSpec = 'node:url';
    const { readFileSync } = await import(fsSpec);
    const { dirname, join } = await import(pathSpec);
    const { fileURLToPath } = await import(urlSpec);
    const here = dirname(fileURLToPath(moduleUrl));
    return readFileSync(join(here, ...pathSegments), 'utf8');
  } catch {
    return null;
  }
}