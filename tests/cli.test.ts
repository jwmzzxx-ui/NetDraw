import { describe, expect, test } from "vitest";
import { parseArgs } from "../src/index.js";

describe("NetDraw CLI", () => {
  test("parses optional graph image export flags", () => {
    expect(
      parseArgs([
        "--input",
        "samples/interfaces.csv",
        "--out",
        "output/image-demo",
        "--export-images",
        "--browser",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "--image-width",
        "1200",
        "--image-height",
        "800"
      ])
    ).toEqual({
      inputPath: "samples/interfaces.csv",
      componentsPath: undefined,
      routesPath: undefined,
      rulesPath: undefined,
      outDir: "output/image-demo",
      imageExport: {
        enabled: true,
        png: true,
        pdf: true,
        browserPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        width: 1200,
        height: 800
      }
    });
  });

  test("parses optional A* route preference flag", () => {
    expect(parseArgs(["--input", "samples/interfaces.csv", "--routes", "samples/routes.csv", "--prefer-astar"])).toEqual(
      expect.objectContaining({
        inputPath: "samples/interfaces.csv",
        routesPath: "samples/routes.csv",
        preferAStar: true
      })
    );
  });
});
