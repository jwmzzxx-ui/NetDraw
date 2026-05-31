import { BENCHMARK_PRESETS, getBenchmarkPreset, runSyntheticBenchmark, type BenchmarkPresetName, type SyntheticNetworkOptions } from "../src/testkit.js";

export interface ParsedBenchmarkArgs {
  presetName?: BenchmarkPresetName;
  options: SyntheticNetworkOptions;
  outDir: string;
}

async function main(): Promise<void> {
  const parsed = parseBenchmarkArgs(process.argv.slice(2));
  const report = await runSyntheticBenchmark(parsed.options, { outDir: parsed.outDir });

  console.log("NetDraw synthetic benchmark complete");
  if (parsed.presetName) {
    console.log(`Preset: ${parsed.presetName}`);
  }
  console.log(`Cables: ${report.summary.cableCount}`);
  console.log(`Route segments: ${report.summary.routeSegmentCount}`);
  console.log(`Overview edges: ${report.visual.overviewEdges}`);
  console.log(`Detail edges: ${report.visual.detailEdges}`);
  console.log(`Initial render adapter time: ${report.metrics.initialRenderTime.toFixed(1)} ms`);
  console.log(`Expand detail adapter time: ${report.metrics.expandDetailTime.toFixed(1)} ms`);
  console.log(`Export time: ${report.metrics.exportTime.toFixed(1)} ms`);
  console.log(`Peak heap: ${report.metrics.peakHeapMb.toFixed(1)} MB`);
  console.log(`Output: ${parsed.outDir}`);
}

export function parseBenchmarkArgs(args: string[]): ParsedBenchmarkArgs {
  const presetName = readPresetName(args);
  const options = presetName ? getBenchmarkPreset(presetName) : parseManualOptions(args);
  const outDir = getValue(args, "--out", presetName ? `output/benchmarks/${presetName}` : "output/benchmark");
  return { presetName, options, outDir };
}

function parseManualOptions(args: string[]): SyntheticNetworkOptions {
  return {
    cableCount: Number(getValue(args, "--cables", "5000")),
    averageRouteHop: Number(getValue(args, "--hops", "2")),
    redundancyRatio: Number(getValue(args, "--redundancy", "0.1")),
    loopRatio: Number(getValue(args, "--loops", "0.02"))
  };
}

function readPresetName(args: string[]): BenchmarkPresetName | undefined {
  const presetValue = getValue(args, "--preset", "");
  if (!presetValue) {
    return undefined;
  }
  if (!(presetValue in BENCHMARK_PRESETS)) {
    throw new Error(`Unknown benchmark preset: ${presetValue}`);
  }
  return presetValue as BenchmarkPresetName;
}

function getValue(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
