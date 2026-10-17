import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runs = Number(process.env.PERF_COMPARE_RUNS ?? "1");
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 10) {
  throw new Error("PERF_COMPARE_RUNS must be an integer from 1 to 10.");
}

const env = {
  ...process.env,
  PERF_POPS: process.env.PERF_POPS ?? "300,600",
  PERF_TICKS: process.env.PERF_TICKS ?? "120",
  PERF_WARMUP: process.env.PERF_WARMUP ?? "30",
  SIM_FULL_SIM: process.env.SIM_FULL_SIM ?? "1",
  DENO_NO_UPDATE_CHECK: "1",
};
const script = "scripts/perf-at-pop.ts";
const runtimes = [
  { name: "Node/tsx", executable: process.execPath, args: ["--import", "tsx", script] },
  {
    name: "Deno",
    executable: "deno",
    args: ["run", "--quiet", "--no-check", "--unstable-sloppy-imports", "--allow-all", script],
  },
];
const samples = [];
console.log(`CPU simulation comparison on ${process.platform}/${process.arch}`);
console.log(`Populations=${env.PERF_POPS}; ticks=${env.PERF_TICKS}; warmup=${env.PERF_WARMUP}; fullSim=${env.SIM_FULL_SIM}; repeats=${runs}`);
if (!env.PERF_SAVE) console.log("Tip: set PERF_SAVE to an existing game save to compare exactly the same starting colony.");

for (let repetition = 0; repetition < runs; repetition++) {
  const order = repetition % 2 === 0 ? runtimes : [...runtimes].reverse();
  for (const runtime of order) {
    console.log(`\n=== ${runtime.name}, pass ${repetition + 1}/${runs} ===`);
    const result = spawnSync(runtime.executable, runtime.args, {
      cwd: projectRoot,
      env,
      encoding: "utf8",
      shell: process.platform === "win32" && runtime.name === "Deno",
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      console.error(result.stdout ?? "");
      console.error(result.stderr ?? "");
      throw new Error(`${runtime.name} benchmark failed (${result.error?.message ?? `exit ${result.status}, signal ${result.signal}`}). No speed comparison is valid.`);
    }
    process.stdout.write(result.stdout);
    const metrics = [...result.stdout.matchAll(/^(.*?): humans=(\d+) alive=(\d+) \| avg=([\d.]+)ms p50=([\d.]+)ms p95=([\d.]+)ms max=([\d.]+)ms/gm)];
    if (metrics.length === 0) throw new Error(`${runtime.name} produced no comparable tick metrics.`);
    for (const match of metrics) {
      samples.push({
        runtime: runtime.name,
        label: match[1],
        humans: Number(match[2]),
        alive: Number(match[3]),
        avgMs: Number(match[4]),
        p95Ms: Number(match[6]),
        pass: repetition + 1,
      });
    }
  }
}

console.log("\n=== Summary (lower tick ms is better) ===");
const groups = [...new Set(samples.map((sample) => sample.label))];
for (const label of groups) {
  const node = samples.filter((sample) => sample.label === label && sample.runtime === "Node/tsx");
  const deno = samples.filter((sample) => sample.label === label && sample.runtime === "Deno");
  if (node.length !== runs || deno.length !== runs) throw new Error(`Missing samples for ${label}.`);
  const counts = new Set([...node, ...deno].map((sample) => `${sample.humans}/${sample.alive}`));
  if (counts.size > 1) {
    console.warn(`${label}: populations differ between runs (${[...counts].join(", ")}); treat the comparison as exploratory.`);
  }
  const nodeTimes = node.map((sample) => sample.p95Ms).sort((a, b) => a - b);
  const denoTimes = deno.map((sample) => sample.p95Ms).sort((a, b) => a - b);
  const middle = Math.floor(runs / 2);
  const nodeP95 = runs % 2 ? nodeTimes[middle] : (nodeTimes[middle - 1] + nodeTimes[middle]) / 2;
  const denoP95 = runs % 2 ? denoTimes[middle] : (denoTimes[middle - 1] + denoTimes[middle]) / 2;
  const difference = ((nodeP95 - denoP95) / nodeP95) * 100;
  console.log(`${label}: median-run p95 Node=${nodeP95.toFixed(2)}ms, Deno=${denoP95.toFixed(2)}ms; Deno ${difference >= 0 ? "lower" : "higher"} by ${Math.abs(difference).toFixed(1)}%`);
}
console.log("These are headless CPU ticks, not browser FPS, worker transport, input latency or GPU render timing.");
console.log("For reliable trends, set PERF_COMPARE_RUNS=3 (or more), use a fixed save and close heavy background applications.");
