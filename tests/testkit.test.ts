import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { buildCytoscapeElements, filterGraphForView } from "../webapp/src/graphAdapter.js";
import {
  BENCHMARK_PRESETS,
  generateSyntheticNetwork,
  getBenchmarkPreset,
  runSyntheticBenchmark,
  summarizeVisualCorrectness
} from "../src/testkit.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("testkit synthetic network generator", () => {
  test("generates a 5000-cable multilayer network with all five net types", () => {
    const synthetic = generateSyntheticNetwork({
      cableCount: 5000,
      averageRouteHop: 2,
      redundancyRatio: 0.1,
      loopRatio: 0.02
    });

    expect(synthetic.rows).toHaveLength(5000);
    expect(synthetic.graph.edges.filter((edge) => edge.type === "logical-cable")).toHaveLength(5000);
    expect(synthetic.graph.edges.filter((edge) => edge.type === "route-segment")).toHaveLength(10000);
    expect(synthetic.summary.netTypes).toEqual(["AC", "DC", "COMM", "SIGNAL", "SAFETY"]);
    expect(synthetic.summary.layers).toEqual(["part", "breakout", "interface", "control", "switch", "ipc"]);
    expect(synthetic.summary.redundantCableCount).toBe(500);
    expect(synthetic.summary.loopCableCount).toBe(100);
  });

  test("keeps overview projection summarized and detail projection expanded", () => {
    const synthetic = generateSyntheticNetwork({
      cableCount: 200,
      averageRouteHop: 2,
      redundancyRatio: 0.1,
      loopRatio: 0.05
    });
    const netTypes = new Set(["AC", "DC", "COMM", "SIGNAL", "SAFETY"]);
    const overview = filterGraphForView(synthetic.positionedGraph, { netTypes, mode: "overview", highlightedId: null, zoom: 0.5 });
    const detail = filterGraphForView(synthetic.positionedGraph, { netTypes, mode: "detail", highlightedId: null, zoom: 1.2 });
    const elements = buildCytoscapeElements(synthetic.positionedGraph, { netTypes, mode: "overview", highlightedId: null, zoom: 0.5 });

    expect(overview.edges.length).toBeLessThan(detail.edges.length);
    expect(detail.edges).toHaveLength(600);
    expect(elements.nodes.filter((node) => node.data.kind === "port").every((node) => node.data.label === "")).toBe(true);
    expect(summarizeVisualCorrectness(synthetic.positionedGraph).overviewEdges).toBe(overview.edges.length);
  });

  test("writes benchmark metrics with render, expand, export, and memory fields", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-testkit-"));
    tempDirs.push(outDir);

    const report = await runSyntheticBenchmark(
      { cableCount: 250, averageRouteHop: 2, redundancyRatio: 0.1, loopRatio: 0.04 },
      { outDir }
    );

    expect(report.metrics.initialRenderTime).toBeGreaterThanOrEqual(0);
    expect(report.metrics.expandDetailTime).toBeGreaterThanOrEqual(0);
    expect(report.metrics.exportTime).toBeGreaterThanOrEqual(0);
    expect(report.metrics.peakHeapMb).toBeGreaterThan(0);
    await expect(stat(join(outDir, "benchmark-report.json"))).resolves.toBeTruthy();
    const saved = JSON.parse(await readFile(join(outDir, "benchmark-report.json"), "utf8"));
    expect(saved.summary.cableCount).toBe(250);
  });

  test("exposes named benchmark presets for medium, large, and stress scenarios", () => {
    expect(Object.keys(BENCHMARK_PRESETS)).toEqual(["medium-1000", "large-5000", "stress-5000-hops5"]);
    expect(getBenchmarkPreset("medium-1000")).toEqual({
      cableCount: 1000,
      averageRouteHop: 2,
      redundancyRatio: 0.1,
      loopRatio: 0.02
    });
    expect(getBenchmarkPreset("stress-5000-hops5")).toEqual({
      cableCount: 5000,
      averageRouteHop: 5,
      redundancyRatio: 0.1,
      loopRatio: 0.02
    });
  });
});
