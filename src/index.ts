import { pathToFileURL } from "node:url";
import type { GraphImageExportOptions } from "./imageExport.js";
import { runPipeline } from "./pipeline.js";

export interface CliArgs {
  inputPath: string;
  componentsPath?: string;
  routesPath?: string;
  rulesPath?: string;
  outDir: string;
  preferAStar?: boolean;
  imageExport?: Partial<GraphImageExportOptions>;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const summary = await runPipeline(args);

  console.log("NetDraw demo complete");
  console.log(`Input rows: ${summary.rowCount}`);
  console.log(`Nodes: ${summary.nodeCount}`);
  console.log(`Edges: ${summary.edgeCount}`);
  console.log(`Logical cables: ${summary.logicalCableCount}`);
  console.log(`Route segments: ${summary.routeSegmentCount}`);
  console.log(`Cables: ${summary.cableCount}`);
  console.log(`Normalization logs: ${summary.normalizationLogCount}`);
  console.log(`Validation issues: ${summary.validationIssueCount}`);
  console.log(`Model diagnostics: ${summary.modelDiagnosticCount}`);
  console.log(`Analysis issues: ${summary.analysisIssueCount}`);
  if (args.imageExport?.enabled) {
    console.log("Graph images: requested");
  }
  console.log(`Output: ${summary.outDir}`);
}

export function parseArgs(args: string[]): CliArgs {
  const getValue = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const getNumber = (flag: string, fallback: number): number => {
    const value = Number(getValue(flag, String(fallback)));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const exportImages = args.includes("--export-images");

  return {
    inputPath: getValue("--input", "samples/interfaces.csv"),
    componentsPath: getOptionalValue("--components"),
    routesPath: getOptionalValue("--routes"),
    rulesPath: getOptionalValue("--rules"),
    outDir: getValue("--out", "output"),
    preferAStar: args.includes("--prefer-astar") ? true : undefined,
    imageExport: exportImages
      ? {
          enabled: true,
          png: !args.includes("--no-png"),
          pdf: !args.includes("--no-pdf"),
          browserPath: getOptionalValue("--browser"),
          width: getNumber("--image-width", 1800),
          height: getNumber("--image-height", 1100)
        }
      : undefined
  };

  function getOptionalValue(flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).toString()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
