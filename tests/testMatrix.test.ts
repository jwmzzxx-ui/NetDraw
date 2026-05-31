import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { runTestMatrix } from "../scripts/test-matrix.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("test matrix runner", () => {
  test("writes a unified report with skipped real sample, benchmark scenarios, and anomaly results", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-matrix-"));
    tempDirs.push(outDir);

    const report = await runTestMatrix({
      outRoot: outDir,
      realSamplePath: join(outDir, "missing-real.csv"),
      benchmarkScenarioNames: ["medium-1000"],
      validCases: [{ name: "baseline", inputPath: "samples/interfaces.csv" }],
      expectedFailureCases: [{ name: "duplicate-row", inputPath: "samples/interfaces-duplicate-row.csv", expectedMessage: "Duplicate row id" }]
    });

    expect(report.sample.summary.skipped).toBe(1);
    expect(report.sample.summary.passed).toBe(1);
    expect(report.sample.summary.expectedFailures).toBe(1);
    expect(report.benchmarks).toHaveLength(1);
    expect(report.benchmarks[0]).toEqual(
      expect.objectContaining({
        name: "medium-1000",
        status: "passed",
        report: expect.objectContaining({
          summary: expect.objectContaining({ cableCount: 1000 })
        })
      })
    );

    const saved = JSON.parse(await readFile(join(outDir, "test-matrix-report.json"), "utf8"));
    expect(saved.sample.summary.skipped).toBe(1);
    expect(saved.benchmarks[0].name).toBe("medium-1000");
  });
});
