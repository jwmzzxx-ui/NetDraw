import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeGraph, renderAnalysisMarkdown } from "./analysis.js";
import { applyComponentMetadata, parseComponentsFile } from "./components.js";
import { writeCableListArtifacts } from "./exportCableList.js";
import { writeGraphSvg } from "./graphSvgExporter.js";
import { exportGraphImages, type GraphImageExportOptions } from "./imageExport.js";
import { createPresetLayout } from "./layout.js";
import { buildCanonicalGraph, renderModelDiagnosticsMarkdown, summarizeModelDiagnostics } from "./model.js";
import { normalizeInterfaceRows, renderNormalizationMarkdown } from "./normalizer.js";
import { parseInterfaceTableFile } from "./parser.js";
import { parseRoutesFile, resolveCableRoutes } from "./routing.js";
import { loadProjectRules, mergeProjectRules } from "./rulesConfig.js";
import { buildLegendItems } from "./styleRules.js";
import type { ExportConfig, PipelineSummary, ValidationIssue } from "./types.js";
import { getBlockingValidationIssues, renderValidationMarkdown, summarizeValidationIssues, validateInterfaceRows } from "./validate.js";

export interface RunPipelineOptions {
  inputPath: string;
  componentsPath?: string;
  routesPath?: string;
  rulesPath?: string;
  outDir: string;
  exportConfig?: ExportConfig;
  preferAStar?: boolean;
  imageExport?: Partial<GraphImageExportOptions>;
}

export class PipelineValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Blocking validation errors: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "PipelineValidationError";
  }
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineSummary> {
  const rules = mergeProjectRules(options.rulesPath ? await loadProjectRules(options.rulesPath) : undefined);
  const exportConfig = { ...rules.export, ...options.exportConfig };
  const parsedRows = await parseInterfaceTableFile(options.inputPath);
  const normalization = normalizeInterfaceRows(parsedRows, rules.normalization.aliases);
  const rows = normalization.rows;
  const components = options.componentsPath ? await parseComponentsFile(options.componentsPath) : [];
  const routeResources = options.routesPath ? await parseRoutesFile(options.routesPath) : [];
  const resolvedRoutes = resolveCableRoutes(rows, routeResources, {
    ...rules.routing,
    preferAStar: options.preferAStar ?? rules.routing.preferAStar
  });
  const validationIssues = validateInterfaceRows(rows);
  const blockingIssues = getBlockingValidationIssues(validationIssues);
  if (blockingIssues.length > 0) {
    throw new PipelineValidationError(blockingIssues);
  }
  const validationReport = {
    summary: summarizeValidationIssues(validationIssues),
    issues: validationIssues
  };
  const graph = applyComponentMetadata(buildCanonicalGraph(rows, resolvedRoutes), components);
  const modelDiagnostics = graph.diagnostics ?? [];
  const cableRows = await writeCableListArtifacts(graph, options.outDir, exportConfig);
  const logicalCableCount = graph.edges.filter((edge) => edge.type === "logical-cable").length;
  const routeSegmentCount = graph.edges.filter((edge) => edge.type === "route-segment").length;
  const analysisReport = analyzeGraph(graph);
  const positionedGraph = createPresetLayout(graph, rules.layout);

  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, "canonical-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "normalization-report.json"), `${JSON.stringify(normalization, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "normalization-report.md"), renderNormalizationMarkdown(normalization.logs), "utf8");
  await writeFile(join(options.outDir, "validation-report.json"), `${JSON.stringify(validationReport, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "validation-report.md"), renderValidationMarkdown(validationIssues), "utf8");
  await writeFile(join(options.outDir, "analysis-report.json"), `${JSON.stringify(analysisReport, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "analysis-report.md"), renderAnalysisMarkdown(analysisReport), "utf8");
  await writeFile(
    join(options.outDir, "model-diagnostics.json"),
    `${JSON.stringify({ summary: summarizeModelDiagnostics(modelDiagnostics), diagnostics: modelDiagnostics }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(options.outDir, "model-diagnostics.md"), renderModelDiagnosticsMarkdown(modelDiagnostics), "utf8");
  await writeFile(join(options.outDir, "positioned-graph.json"), `${JSON.stringify(positionedGraph, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "style-rules.json"), `${JSON.stringify(rules.style, null, 2)}\n`, "utf8");
  await writeFile(join(options.outDir, "legend.json"), `${JSON.stringify(buildLegendItems(rules.style), null, 2)}\n`, "utf8");
  const graphSvgPath = join(options.outDir, "graph.svg");
  await writeGraphSvg(positionedGraph, graphSvgPath, { title: "NetDraw Graph", rules: rules.style });
  await exportGraphImages(graphSvgPath, options.outDir, options.imageExport);

  return {
    inputPath: options.inputPath,
    outDir: options.outDir,
    rowCount: rows.length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    logicalCableCount,
    routeSegmentCount,
    cableCount: cableRows.length,
    normalizationLogCount: normalization.logs.length,
    validationIssueCount: validationIssues.length,
    modelDiagnosticCount: modelDiagnostics.length,
    analysisIssueCount: analysisReport.issues.length
  };
}
