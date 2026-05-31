import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getBenchmarkPreset,
  runSyntheticBenchmark,
  type BenchmarkPresetName,
  type SyntheticBenchmarkReport
} from "../src/testkit.js";
import {
  runSampleVerificationMatrix,
  type ExpectedFailureCase,
  type SampleVerificationCase,
  type SampleVerificationMatrixReport
} from "./verify-samples.js";

export interface BenchmarkScenarioResult {
  name: BenchmarkPresetName;
  status: "passed" | "failed";
  outDir: string;
  report?: SyntheticBenchmarkReport;
  message?: string;
}

export interface TestMatrixReport {
  generatedAt: string;
  sample: SampleVerificationMatrixReport;
  benchmarks: BenchmarkScenarioResult[];
  summary: {
    sampleFailures: number;
    benchmarkFailures: number;
  };
}

export interface RunTestMatrixOptions {
  outRoot?: string;
  realSamplePath?: string;
  benchmarkScenarioNames?: BenchmarkPresetName[];
  validCases?: SampleVerificationCase[];
  expectedFailureCases?: ExpectedFailureCase[];
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);

export async function runTestMatrix(options: RunTestMatrixOptions = {}): Promise<TestMatrixReport> {
  const outRoot = options.outRoot ?? join(repoRoot, "output", "test-matrix");
  await mkdir(outRoot, { recursive: true });

  const sample = await runSampleVerificationMatrix({
    outRoot: join(outRoot, "samples"),
    realSamplePath: options.realSamplePath,
    validCases: options.validCases,
    expectedFailureCases: options.expectedFailureCases
  });

  const benchmarkScenarioNames = options.benchmarkScenarioNames ?? ["medium-1000", "large-5000", "stress-5000-hops5"];
  const benchmarks: BenchmarkScenarioResult[] = [];

  for (const name of benchmarkScenarioNames) {
    const outDir = join(outRoot, "benchmarks", name);
    try {
      const report = await runSyntheticBenchmark(getBenchmarkPreset(name), { outDir });
      benchmarks.push({ name, status: "passed", outDir, report });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      benchmarks.push({ name, status: "failed", outDir, message });
    }
  }

  const report: TestMatrixReport = {
    generatedAt: new Date().toISOString(),
    sample,
    benchmarks,
    summary: {
      sampleFailures: sample.summary.failed,
      benchmarkFailures: benchmarks.filter((benchmark) => benchmark.status === "failed").length
    }
  };

  await writeFile(join(outRoot, "test-matrix-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function renderBenchmarkResult(result: BenchmarkScenarioResult): string {
  if (result.status === "failed") {
    return `[failed] ${result.name}: ${result.message}`;
  }
  return `[passed] ${result.name}: ${result.report?.summary.cableCount ?? 0} cables`;
}

async function main(): Promise<void> {
  const report = await runTestMatrix();
  for (const result of report.sample.results) {
    const suffix = result.message ? `: ${result.message}` : "";
    console.log(`[${result.status}] ${result.group ?? "sample"} ${result.name}${suffix}`);
  }
  for (const result of report.benchmarks) {
    console.log(renderBenchmarkResult(result));
  }

  if (report.summary.sampleFailures > 0 || report.summary.benchmarkFailures > 0) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
