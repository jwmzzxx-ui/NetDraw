import { describe, expect, test } from "vitest";
import { parseBenchmarkArgs } from "../scripts/benchmark.js";

describe("benchmark script CLI", () => {
  test("accepts named presets and derives the default output directory from the preset name", () => {
    expect(parseBenchmarkArgs(["--preset", "medium-1000"])).toEqual({
      presetName: "medium-1000",
      outDir: "output/benchmarks/medium-1000",
      options: {
        cableCount: 1000,
        averageRouteHop: 2,
        redundancyRatio: 0.1,
        loopRatio: 0.02
      }
    });
  });
});
