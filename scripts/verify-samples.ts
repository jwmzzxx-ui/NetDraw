import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { runPipeline, type RunPipelineOptions } from "../src/pipeline.js";

export interface SampleVerificationCase {
  name: string;
  inputPath: string;
  routesPath?: string;
  componentsPath?: string;
  rulesPath?: string;
  verifyArtifacts?: (context: SampleVerificationContext) => Promise<void> | void;
}

export interface ExpectedFailureCase extends SampleVerificationCase {
  expectedMessage: string | RegExp;
}

export interface SampleVerificationOptions {
  outRoot?: string;
  validCases?: SampleVerificationCase[];
  expectedFailureCases?: ExpectedFailureCase[];
}

export type SampleVerificationStatus = "passed" | "expected-failure" | "failed" | "skipped";

export type SampleVerificationGroup = "real-sample" | "sample-regression" | "anomaly";

export interface SampleVerificationContext {
  sampleCase: SampleVerificationCase;
  outDir: string;
}

export interface SampleVerificationResult {
  name: string;
  status: SampleVerificationStatus;
  message?: string;
  outDir?: string;
  group?: SampleVerificationGroup;
}

export interface SampleVerificationMatrixOptions extends SampleVerificationOptions {
  realSamplePath?: string;
  anomalyValidCases?: SampleVerificationCase[];
}

export interface SampleVerificationMatrixReport {
  results: SampleVerificationResult[];
  summary: {
    passed: number;
    expectedFailures: number;
    failed: number;
    skipped: number;
  };
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);

export async function runSampleVerification(options: SampleVerificationOptions = {}): Promise<SampleVerificationResult[]> {
  const outRoot = options.outRoot ?? join(repoRoot, "output", "sample-verification");
  const validCases = options.validCases ?? defaultValidCases();
  const expectedFailureCases = options.expectedFailureCases ?? defaultExpectedFailureCases();
  const results: SampleVerificationResult[] = [];

  await mkdir(outRoot, { recursive: true });

  for (const sampleCase of validCases) {
    const outDir = join(outRoot, sampleCase.name);
    try {
      await runPipeline(toPipelineOptions(sampleCase, outDir));
      await sampleCase.verifyArtifacts?.({ sampleCase, outDir });
      results.push({ name: sampleCase.name, status: "passed", outDir });
    } catch (error) {
      results.push({
        name: sampleCase.name,
        status: "failed",
        outDir,
        message: `Expected sample to pass, but it failed: ${messageFromUnknown(error)}`
      });
    }
  }

  for (const sampleCase of expectedFailureCases) {
    const outDir = join(outRoot, sampleCase.name);
    try {
      await runPipeline(toPipelineOptions(sampleCase, outDir));
      results.push({
        name: sampleCase.name,
        status: "failed",
        outDir,
        message: "Expected sample to fail, but it passed"
      });
    } catch (error) {
      const message = messageFromUnknown(error);
      results.push({
        name: sampleCase.name,
        status: matchesExpectedMessage(message, sampleCase.expectedMessage) ? "expected-failure" : "failed",
        outDir,
        message
      });
    }
  }

  return results;
}

export async function runSampleVerificationMatrix(options: SampleVerificationMatrixOptions = {}): Promise<SampleVerificationMatrixReport> {
  const outRoot = options.outRoot ?? join(repoRoot, "output", "sample-verification");
  const results: SampleVerificationResult[] = [];
  const realSamplePath = options.realSamplePath ?? join(repoRoot, "samples", "real", "interfaces-small-real.csv");

  if (await fileExists(realSamplePath)) {
    const [realResult] = await runSampleVerification({
      outRoot: join(outRoot, "real-sample"),
      validCases: [
        {
          name: "real-small-sample",
          inputPath: realSamplePath
        }
      ],
      expectedFailureCases: []
    });
    results.push({ ...realResult, group: "real-sample" });
  } else {
    results.push({
      name: "real-small-sample",
      status: "skipped",
      group: "real-sample",
      message: `Real sample fixture not found: ${realSamplePath}`
    });
  }

  const sampleRegressionCases = options.validCases ?? defaultValidCases();
  const anomalyPassCases =
    options.anomalyValidCases ?? (options.validCases || options.expectedFailureCases ? [] : defaultAnomalyValidCases());
  const anomalyFailureCases = options.expectedFailureCases ?? defaultExpectedFailureCases();

  const regressionResults = await runSampleVerification({
    outRoot: join(outRoot, "sample-regression"),
    validCases: sampleRegressionCases,
    expectedFailureCases: []
  });
  results.push(...regressionResults.map((result) => ({ ...result, group: "sample-regression" as const })));

  const anomalyResults = await runSampleVerification({
    outRoot: join(outRoot, "anomalies"),
    validCases: anomalyPassCases,
    expectedFailureCases: anomalyFailureCases
  });
  results.push(...anomalyResults.map((result) => ({ ...result, group: "anomaly" as const })));

  return {
    results,
    summary: summarizeMatrixResults(results)
  };
}

function defaultValidCases(): SampleVerificationCase[] {
  return [
    {
      name: "interfaces",
      inputPath: join(repoRoot, "samples", "interfaces.csv")
    },
    {
      name: "routes",
      inputPath: join(repoRoot, "samples", "interfaces-route-shortcut.csv"),
      routesPath: join(repoRoot, "samples", "routes.csv")
    },
    {
      name: "astar",
      inputPath: join(repoRoot, "samples", "interfaces-route-shortcut.csv"),
      routesPath: join(repoRoot, "samples", "routes-geometry.csv"),
      rulesPath: join(repoRoot, "samples", "rules-astar.json")
    },
    {
      name: "rules",
      inputPath: join(repoRoot, "samples", "interfaces.csv"),
      rulesPath: join(repoRoot, "samples", "rules.json")
    },
    {
      name: "components",
      inputPath: join(repoRoot, "samples", "interfaces.csv"),
      componentsPath: join(repoRoot, "samples", "components.csv"),
      rulesPath: join(repoRoot, "samples", "rules.json")
    },
    {
      name: "aliases",
      inputPath: join(repoRoot, "samples", "interfaces-aliases.csv"),
      routesPath: join(repoRoot, "samples", "routes.csv"),
      rulesPath: join(repoRoot, "samples", "rules-aliases.json")
    }
  ];
}

function defaultExpectedFailureCases(): ExpectedFailureCase[] {
  return [
    {
      name: "parser-invalid",
      inputPath: join(repoRoot, "samples", "interfaces-invalid.csv"),
      expectedMessage: /Invalid interface row/
    },
    {
      name: "duplicate-row",
      inputPath: join(repoRoot, "samples", "interfaces-duplicate-row.csv"),
      expectedMessage: "Duplicate row id"
    },
    {
      name: "broken-route",
      inputPath: join(repoRoot, "samples", "interfaces-route-broken.csv"),
      routesPath: join(repoRoot, "samples", "routes-broken.csv"),
      expectedMessage: "No route path from SPL_A to CAB_3"
    }
  ];
}

function defaultAnomalyValidCases(): SampleVerificationCase[] {
  return [
    {
      name: "cycle-warning",
      inputPath: join(repoRoot, "samples", "interfaces-cycle.csv"),
      verifyArtifacts: async ({ outDir }) => {
        const report = JSON.parse(await readFile(join(outDir, "analysis-report.json"), "utf8"));
        assertIssue(report.issues, "DIRECTED_CYCLE", "cycle-warning");
      }
    },
    {
      name: "unknown-component-warning",
      inputPath: join(repoRoot, "samples", "interfaces.csv"),
      componentsPath: join(repoRoot, "samples", "components-unknown.csv"),
      verifyArtifacts: async ({ outDir }) => {
        const diagnostics = JSON.parse(await readFile(join(outDir, "model-diagnostics.json"), "utf8"));
        assertIssue(diagnostics.diagnostics, "UNKNOWN_COMPONENT_NODE", "unknown-component-warning");
      }
    }
  ];
}

function toPipelineOptions(sampleCase: SampleVerificationCase, outDir: string): RunPipelineOptions {
  return {
    inputPath: sampleCase.inputPath,
    routesPath: sampleCase.routesPath,
    componentsPath: sampleCase.componentsPath,
    rulesPath: sampleCase.rulesPath,
    outDir
  };
}

function matchesExpectedMessage(message: string, expected: string | RegExp): boolean {
  return typeof expected === "string" ? message.includes(expected) : expected.test(message);
}

function assertIssue(issues: Array<{ code?: string; message?: string }>, code: string, sampleName: string): void {
  if (!issues.some((issue) => issue.code === code)) {
    throw new Error(`Expected ${sampleName} to include diagnostic ${code}`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function summarizeMatrixResults(results: SampleVerificationResult[]): SampleVerificationMatrixReport["summary"] {
  return {
    passed: results.filter((result) => result.status === "passed").length,
    expectedFailures: results.filter((result) => result.status === "expected-failure").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length
  };
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderResult(result: SampleVerificationResult): string {
  const suffix = result.message ? `: ${result.message}` : "";
  return `[${result.status}] ${result.name}${suffix}`;
}

async function main(): Promise<void> {
  const results = await runSampleVerification();
  for (const result of results) {
    console.log(renderResult(result));
  }

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
