import { describe, expect, test } from "vitest";
import { pathToFileURL } from "node:url";
import { buildChromeImageExportArgs, defaultGraphImageExportOptions } from "../src/imageExport.js";

describe("graph image export", () => {
  test("builds Chrome headless screenshot arguments for PNG export", () => {
    const args = buildChromeImageExportArgs("png", {
      svgPath: "F:\\NetDraw\\output\\graph.svg",
      outputPath: "F:\\NetDraw\\output\\graph.png",
      width: 1200,
      height: 800,
      userDataDir: "F:\\NetDraw\\.chrome-export-profile"
    });

    expect(args).toEqual([
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=F:\\NetDraw\\.chrome-export-profile",
      "--window-size=1200,800",
      "--screenshot=F:\\NetDraw\\output\\graph.png",
      pathToFileURL("F:\\NetDraw\\output\\graph.svg").toString()
    ]);
  });

  test("builds Chrome headless print arguments for PDF export", () => {
    const args = buildChromeImageExportArgs("pdf", {
      svgPath: "F:\\NetDraw\\output\\graph.svg",
      outputPath: "F:\\NetDraw\\output\\graph.pdf",
      width: 1800,
      height: 1100
    });

    expect(args).toContain("--print-to-pdf=F:\\NetDraw\\output\\graph.pdf");
    expect(args).toContain("--window-size=1800,1100");
  });

  test("defaults to both PNG and PDF graph image exports", () => {
    expect(defaultGraphImageExportOptions()).toEqual({
      enabled: false,
      png: true,
      pdf: true,
      width: 1800,
      height: 1100
    });
  });
});
