import { analyzeGraph } from "../../src/analysis.js";
import { createPresetLayout } from "../../src/layout.js";
import { buildCanonicalGraph, summarizeModelDiagnostics } from "../../src/model.js";
import { normalizeInterfaceRows } from "../../src/normalizer.js";
import { parseInterfaceTableData } from "../../src/parser.js";
import { resolveCableRoutes } from "../../src/routing.js";
import type { PositionedGraph } from "../../src/types.js";
import { getBlockingValidationIssues, summarizeValidationIssues, validateInterfaceRows } from "../../src/validate.js";

export interface ImportedGraphData {
  fileName: string;
  rowCount: number;
  positionedGraph: PositionedGraph;
  summaries: {
    validationWarnings: number;
    normalizationWarnings: number;
    modelWarnings: number;
    analysisWarnings: number;
  };
}

export async function importPositionedGraphFromTable(file: File): Promise<ImportedGraphData> {
  const rows = parseInterfaceTableData(file.name, await file.arrayBuffer());
  const normalization = normalizeInterfaceRows(rows);
  const validationIssues = validateInterfaceRows(normalization.rows);
  const blockingIssues = getBlockingValidationIssues(validationIssues);
  if (blockingIssues.length > 0) {
    throw new Error(blockingIssues.map((issue) => issue.message).join("; "));
  }

  const graph = buildCanonicalGraph(normalization.rows, resolveCableRoutes(normalization.rows));
  const analysis = analyzeGraph(graph);

  return {
    fileName: file.name,
    rowCount: normalization.rows.length,
    positionedGraph: createPresetLayout(graph),
    summaries: {
      validationWarnings: summarizeValidationIssues(validationIssues).warnings,
      normalizationWarnings: normalization.logs.filter((log) => log.severity === "warning").length,
      modelWarnings: summarizeModelDiagnostics(graph.diagnostics ?? []).warnings,
      analysisWarnings: analysis.issues.filter((issue) => issue.severity === "warning").length
    }
  };
}
