import { describe, expect, test } from "vitest";
import { createBenchmarkMetrics, formatMs, generateSyntheticPositionedGraph } from "../webapp/src/benchmark.js";

describe("web benchmark utilities", () => {
  test("creates default benchmark metrics for the panel", () => {
    expect(createBenchmarkMetrics()).toEqual({
      parseTime: 0,
      graphBuildTime: 0,
      renderInitTime: 0,
      expandDetailTime: 0,
      exportTime: 0
    });
    expect(formatMs(12.345)).toBe("12.3 ms");
  });

  test("generates synthetic 5000 cable graph inputs", () => {
    const graph = generateSyntheticPositionedGraph({ cableCount: 5000, averageRouteHop: 2 });
    expect(graph.edges.filter((edge) => edge.type === "logical-cable")).toHaveLength(5000);
    expect(graph.edges.filter((edge) => edge.type === "route-segment")).toHaveLength(10000);
    expect(graph.nodes.length).toBeGreaterThan(100);
  });
});
