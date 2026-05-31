import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createCanonicalGraph } from "./model.js";
import type { CanonicalGraph, ComponentRow, LayerType, ModelDiagnostic } from "./types.js";

type RawRecord = Record<string, unknown>;

const layerValues: LayerType[] = ["part", "breakout", "interface", "control", "switch", "ipc", "route"];

const componentFieldAliases: Record<keyof ComponentRow, string[]> = {
  nodeId: ["node_id", "nodeId", "component_id", "componentId", "id"],
  componentType: ["component_type", "componentType", "type", "kind"],
  layer: ["layer", "physical_layer"],
  cabinet: ["cabinet", "cabinet_id", "cabinetId", "zone"],
  slot: ["slot", "slot_id", "slotId"],
  order: ["order", "sort_order", "sortOrder", "position_order"],
  displayName: ["display_name", "displayName", "name", "label"],
  remarks: ["remarks", "remark", "notes", "comment"]
};

const componentRowSchema = z.object({
  nodeId: z.string().trim().min(1),
  componentType: z.string().trim().min(1),
  layer: z.enum(layerValues as [LayerType, ...LayerType[]]).optional(),
  cabinet: z.string().trim().optional(),
  slot: z.string().trim().optional(),
  order: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  remarks: z.string().trim().optional()
});

export function parseComponentsCsv(csv: string): ComponentRow[] {
  const parsed = Papa.parse<RawRecord>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`Components CSV parse error at row ${firstError.row ?? "unknown"}: ${firstError.message}`);
  }

  return normalizeComponentRecords(parsed.data);
}

export async function parseComponentsFile(filePath: string): Promise<ComponentRow[]> {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".csv") {
    return parseComponentsCsv(await readFile(filePath, "utf8"));
  }

  if (extension === ".xlsx" || extension === ".xls") {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error(`Components workbook has no sheets: ${filePath}`);
    }
    const records = XLSX.utils.sheet_to_json<RawRecord>(workbook.Sheets[firstSheetName], { defval: "" });
    return normalizeComponentRecords(records);
  }

  throw new Error(`Unsupported components file extension: ${extension}`);
}

export function applyComponentMetadata(graph: CanonicalGraph, components: ComponentRow[]): CanonicalGraph {
  const componentByNodeId = new Map(components.map((component) => [component.nodeId, component]));
  const matchedNodeIds = new Set<string>();
  const enrichedGraph = createCanonicalGraph(
    graph.nodes.map((node) => {
      const component = componentByNodeId.get(node.id);
      if (!component) {
        return node;
      }
      matchedNodeIds.add(node.id);

      return {
        ...node,
        displayName: component.displayName ?? node.displayName,
        layer: component.layer ?? node.layer,
        metadata: {
          ...node.metadata,
          componentType: component.componentType,
          cabinet: component.cabinet,
          slot: component.slot,
          order: component.order,
          remarks: component.remarks
        }
      };
    }),
    graph.edges
  );

  const unmatchedDiagnostics: ModelDiagnostic[] = components
    .filter((component) => !matchedNodeIds.has(component.nodeId))
    .map((component) => ({
      code: "UNKNOWN_COMPONENT_NODE" as const,
      severity: "warning" as const,
      nodeId: component.nodeId,
      message: `Component metadata references unknown graph node ${component.nodeId}`
    }));

  return unmatchedDiagnostics.length === 0
    ? enrichedGraph
    : {
        ...enrichedGraph,
        diagnostics: [...(enrichedGraph.diagnostics ?? []), ...unmatchedDiagnostics]
      };
}

function normalizeComponentRecords(records: RawRecord[]): ComponentRow[] {
  return records.map((record, index) => {
    const normalized: Partial<Record<keyof ComponentRow, string>> = {};

    for (const [field, aliases] of Object.entries(componentFieldAliases) as Array<[keyof ComponentRow, string[]]>) {
      normalized[field] = readFirstValue(record, aliases);
    }

    const result = componentRowSchema.safeParse(normalized);
    if (!result.success) {
      const details = result.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`).join("; ");
      throw new Error(`Invalid component row ${index + 1}: ${details}`);
    }

    return result.data;
  });
}

function readFirstValue(record: RawRecord, aliases: string[]): string | undefined {
  const lowerKeyMap = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));

  for (const alias of aliases) {
    const actualKey = lowerKeyMap.get(alias.toLowerCase());
    if (!actualKey) {
      continue;
    }
    const value = record[actualKey];
    if (value === null || value === undefined) {
      return undefined;
    }
    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : undefined;
  }

  return undefined;
}
