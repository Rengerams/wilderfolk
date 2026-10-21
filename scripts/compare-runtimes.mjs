import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  PERF_POPS: process.env.PERF_POPS ?? "300,600",
  PERF_TICKS: process.env.PERF_TICKS ?? "120",
  PERF_WARMUP: process.env.PERF_WARMUP ?? "30",
  SIM_FULL_SIM: process.env.SIM_FULL_SIM ?? "1",
  DENO_NO_UPDATE_CHECK: "1",
};
const integer = (name, fallback, max) => {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
};
const runs = integer("PERF_COMPARE_RUNS", 1, 10);
integer("PERF_TICKS", 120, 1_000_000);
const timeoutMs = integer("PERF_TIMEOUT_MS", 900_000, 3_600_000);
const denoExecutable = process.env.DENO_EXE || "deno";
const runtimes = [
  { name: "Node/tsx", executable: process.execPath, args: ["--import", "tsx", "scripts/perf-at-pop.ts"] },
  { name: "Deno", executable: denoExecutable, args: ["run", "--quiet", "--no-check", "--unstable-sloppy-imports", "--allow-all", "scripts/perf-at-pop.ts"] },
];
const version = (runtime) => {
  const result = spawnSync(runtime.executable, ["--version"], {
    cwd: root, env, encoding: "utf8", shell: false, timeout: 10_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${runtime.name} could not start (${result.error?.message ?? result.stderr?.trim() ?? result.status}). Verify PATH or set DENO_EXE to deno.exe's absolute path.`);
  }
  return (result.stdout || result.stderr).split("\n")[0].trim();
};

export function parseResults(output, runtime) {
  const lines = output.split(/\r?\n/).filter(line => line.startsWith("PERF_RESULT "));
  if (!lines.length) throw new Error(`${runtime} produced no PERF_RESULT records`);
  const labels = new Set();
  return lines.map(line => {
    let item;
    try { item = JSON.parse(line.slice("PERF_RESULT ".length)); }
    catch { throw new Error(`${runtime}: invalid PERF_RESULT JSON`); }
    if (typeof item.label !== "string" || !item.label || labels.has(item.label)
        || !Number.isSafeInteger(item.humans) || item.humans < 0
        || !Number.isSafeInteger(item.alive) || item.alive < item.humans
        || !Number.isFinite(item.p95Ms) || item.p95Ms <= 0
        || !Number.isFinite(item.averageMs) || item.averageMs <= 0
        || typeof item.deltaHash !== "string" || !item.deltaHash) {
      throw new Error(`${runtime}: malformed or duplicate PERF_RESULT data`);
    }
    labels.add(item.label);
    return item;
  });
}
export function validateComparable(left, right) {
  const a = new Map(left.map(item => [item.label, item]));
  const b = new Map(right.map(item => [item.label, item]));
  if (a.size !== b.size || [...a.keys()].some(label => !b.has(label))) {
    throw new Error("Runtime benchmark labels differ; comparison rejected");
  }
  for (const [label, x] of a) {
    const y = b.get(label);
    if (x.humans !== y.humans || x.alive !== y.alive || x.deltaHash !== y.deltaHash) {
      throw new Error(`${label}: simulation differs between runtimes (Node ${x.humans}/${x.alive}/${x.deltaHash}, Deno ${y.humans}/${y.alive}/${y.deltaHash}); comparison rejected`);
    }
  }
}
export function median(values) {
  if (!values.length) throw new Error("Cannot calculate median of empty samples");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function execute(runtime, pass) {
  console.log(`\n=== ${runtime.name}: pass ${pass}/${runs} ===`);
  console.log(`Command: ${runtime.executable} ${runtime.args.join(" ")}`);
  const start = performance.now();
  let stdout = "";
  const processHandle = spawn(runtime.executable, runtime.args, { cwd: root, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  processHandle.stdout.setEncoding("utf8");
  processHandle.stderr.setEncoding("utf8");
  processHandle.stdout.on("data", chunk => { stdout += chunk; process.stdout.write(chunk); });
  processHandle.stderr.on("data", chunk => process.stderr.write(chunk));
  const outcome = await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      processHandle.kill();
      reject(new Error(`${runtime.name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    processHandle.once("error", error => { clearTimeout(timeout); reject(error); });
    processHandle.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`${runtime.name} exited ${code} (signal ${signal ?? "none"})`));
      else resolvePromise(true);
    });
  });
  void outcome;
  const samples = parseResults(stdout, runtime.name);
  console.log(`Completed ${runtime.name} in ${((performance.now() - start) / 1000).toFixed(1)}s; ${samples.length} scenario(s)`);
  return samples;
}

async function main() {
  console.log(`CPU simulation comparison on ${process.platform}/${process.arch}`);
  console.log(`Population(s): ${env.PERF_SAVE ? "save " + env.PERF_SAVE : env.PERF_POPS}; measured ticks: ${env.PERF_TICKS}; warmup: ${env.PERF_WARMUP}; fullSim: ${env.SIM_FULL_SIM}; repeats: ${runs}; timeout: ${timeoutMs}ms`);
  console.log(`Node: ${version(runtimes[0])}`);
  console.log(`Deno: ${version(runtimes[1])} (${denoExecutable})`);
  if (!env.PERF_SAVE) console.log("Tip: PERF_SAVE=<save.json> benchmarks the same existing colony.");
  const groups = new Map();
  for (let pass = 1; pass <= runs; pass++) {
    const order = pass % 2 ? runtimes : [...runtimes].reverse();
    const results = new Map();
    for (const runtime of order) results.set(runtime.name, await execute(runtime, pass));
    const node = results.get("Node/tsx");
    const deno = results.get("Deno");
    validateComparable(node, deno);
    for (const row of node) {
      const other = deno.find(x => x.label === row.label);
      if (!groups.has(row.label)) groups.set(row.label, { node: [], deno: [] });
      groups.get(row.label).node.push(row.p95Ms);
      groups.get(row.label).deno.push(other.p95Ms);
    }
    console.log(`Pass ${pass}/${runs}: equivalent simulation hashes confirmed`);
  }
  console.log("\n=== Summary (lower p95 tick ms is better) ===");
  for (const [label, data] of groups) {
    const node = median(data.node), deno = median(data.deno);
    const change = ((deno - node) / node) * 100;
    console.log(`${label}: median-run p95 Node=${node.toFixed(3)}ms, Deno=${deno.toFixed(3)}ms (${change > 0 ? "+" : ""}${change.toFixed(1)}%). Node range ${Math.min(...data.node).toFixed(3)}–${Math.max(...data.node).toFixed(3)}ms; Deno range ${Math.min(...data.deno).toFixed(3)}–${Math.max(...data.deno).toFixed(3)}ms`);
  }
  console.log("Headless CPU ticks only, not browser FPS, worker transport or GPU rendering.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("\nBenchmark aborted:", error.message); process.exitCode = 1; });
}
