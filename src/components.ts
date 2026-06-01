import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { CANONICAL_LAYER_IDS, normalizeLayerId } from "./layers.js";
import { createCanonicalGraph } from "./model.js";
import { toSlug } from "./normalizer.js";
import type { CanonicalGraph, ComponentRow, GraphPort, LayerId, ModelDiagnostic } from "./types.js";

type RawRecord = Record<string, unknown>;

const componentFieldAliases: Record<keyof ComponentRow, string[]> = {
  componentId: ["component_id", "componentId", "node_id", "nodeId", "id"],
  componentType: ["component_type", "componentType", "type", "kind"],
  componentName: ["component_name", "componentName", "name"],
  pdmCode: ["PDM_Code", "PDMCode", "pdm_code", "pdmCode", "component_code", "componentCode", "code", "part_number"],
  componentCode: ["component_code", "componentCode", "code", "part_number"],
  layer: ["layer", "physical_layer"],
  layerId: ["layer_id", "layerId", "level_id", "levelId"],
  layerName: ["layer_name", "layerName", "level_name", "levelName"],
  module: ["module", "module_id", "moduleId", "subgraph", "subgraph_id", "subgraphId"],
  cabinet: ["cabinet", "cabinet_id", "cabinetId", "zone"],
  slot: ["slot", "slot_id", "slotId"],
  order: ["order", "sort_order", "sortOrder", "position_order"],
  displayName: ["display_name", "displayName", "label"],
  ports: ["ports", "port_list", "portList"],
  templateId: ["template_id", "templateId", "display_template", "displayTemplate"],
  templateVariant: ["template_variant", "templateVariant", "variant"],
  templateParams: ["template_params", "templateParams", "params"],
  remarks: ["remarks", "remark", "notes", "comment"],
  nodeId: ["node_id", "nodeId"]
};

const componentRowSchema = z.object({
  componentId: z.string().trim().min(1),
  componentType: z.string().trim().min(1),
  componentName: z.string().trim().optional(),
  pdmCode: z.string().trim().optional(),
  componentCode: z.string().trim().optional(),
  layer: z.string().trim().optional(),
  layerId: z.enum(CANONICAL_LAYER_IDS as [LayerId, ...LayerId[]]).optional(),
  layerName: z.string().trim().optional(),
  module: z.string().trim().optional(),
  cabinet: z.string().trim().optional(),
  slot: z.string().trim().optional(),
  order: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  ports: z.string().trim().optional(),
  templateId: z.string().trim().optional(),
  templateVariant: z.string().trim().optional(),
  templateParams: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
  nodeId: z.string().trim().optional()
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
  const componentByNodeId = new Map<string, ComponentRow>();
  for (const component of components) {
    for (const key of componentLookupKeys(component)) {
      componentByNodeId.set(key, component);
    }
    const pdmCode = readComponentPdmCode(component);
    if (pdmCode) {
      componentByNodeId.set(pdmCode, component);
      componentByNodeId.set(`component:${toSlug(pdmCode)}`, component);
    }
    if (component.nodeId) {
      componentByNodeId.set(component.nodeId, component);
    }
  }
  const matchedNodeIds = new Set<string>();
  const enrichedGraph = createCanonicalGraph(
    graph.nodes.map((node) => {
      const component =
        componentByNodeId.get(node.id) ??
        componentByNodeId.get(node.componentId ?? "") ??
        componentByNodeId.get(node.pdmCode ?? "") ??
        componentByNodeId.get(node.componentCode ?? "") ??
        componentByNodeId.get(node.metadata?.componentId ?? "") ??
        componentByNodeId.get(node.metadata?.pdmCode ?? "") ??
        componentByNodeId.get(node.metadata?.componentCode ?? "");
      if (!component) {
        return node;
      }
      matchedNodeIds.add(node.id);

      const portIdFromLegacyNode = legacyPortId(component.nodeId ?? component.componentId);
      return {
        ...node,
        displayName: component.displayName ?? component.componentName ?? node.displayName,
        componentId: component.componentId,
        componentName: component.componentName ?? component.displayName ?? node.componentName ?? node.displayName,
        pdmCode: readComponentPdmCode(component) ?? component.componentId,
        componentCode: readComponentPdmCode(component) ?? component.componentId,
        ports: mergePorts(
          node.ports,
          component.ports ?? (portIdFromLegacyNode ? [{
            portId: portIdFromLegacyNode,
            displayName: component.displayName ?? portIdFromLegacyNode,
            connectorName: component.displayName ?? portIdFromLegacyNode,
            metadata: {
              componentType: component.componentType,
              module: component.module,
              cabinet: component.cabinet,
              slot: component.slot,
              order: component.order,
              remarks: component.remarks
            }
          }] : undefined)
        ),
        layerId: component.layerId ?? (component.layer ? normalizeLayerId(component.layer) : node.layerId),
        layerName: component.layerName ?? node.layerName,
        module: component.module ?? node.module,
        cabinet: component.cabinet ?? node.cabinet,
        slot: component.slot ?? node.slot,
        order: component.order ?? node.order,
        layer: component.layerId ?? (component.layer ? normalizeLayerId(component.layer) : node.layer),
        metadata: {
          ...node.metadata,
          componentId: component.componentId,
          componentName: component.componentName ?? component.displayName,
          pdmCode: readComponentPdmCode(component) ?? component.componentId,
          componentCode: readComponentPdmCode(component) ?? component.componentId,
          componentType: component.componentType,
          layerId: component.layerId ?? (component.layer ? normalizeLayerId(component.layer) : node.metadata?.layerId),
          layerName: component.layerName,
          legacyLayer: component.layer,
          module: component.module,
          cabinet: component.cabinet,
          slot: component.slot,
          order: component.order,
          templateId: component.templateId,
          templateVariant: component.templateVariant,
          templateParams: component.templateParams,
          remarks: component.remarks
        }
      };
    }),
    graph.edges
  );

  const unmatchedDiagnostics: ModelDiagnostic[] = components
    .filter((component) => !matchedNodeIds.has(component.nodeId ?? component.componentId ?? ""))
    .map((component) => ({
      code: "UNKNOWN_COMPONENT_NODE" as const,
      severity: "warning" as const,
      nodeId: component.nodeId ?? component.componentId,
      message: `Component metadata references unknown graph node ${component.nodeId ?? component.componentId ?? "unknown"}`
    }));

  return unmatchedDiagnostics.length === 0
    ? enrichedGraph
    : {
        ...enrichedGraph,
        diagnostics: [...(enrichedGraph.diagnostics ?? []), ...unmatchedDiagnostics]
      };
}

function componentLookupKeys(component: ComponentRow): string[] {
  const ids = [component.componentId, readComponentPdmCode(component), component.nodeId].filter((value): value is string => Boolean(value));
  const keys = new Set<string>();
  for (const id of ids) {
    keys.add(id);
    keys.add(`component:${toSlug(id)}`);
    const legacy = legacyComponentId(id);
    if (legacy) {
      keys.add(legacy);
      keys.add(`component:${toSlug(legacy)}`);
    }
  }
  return Array.from(keys);
}

function readComponentPdmCode(component: ComponentRow): string | undefined {
  return component.pdmCode ?? component.componentCode;
}

function legacyComponentId(value: string): string | undefined {
  const rest = value.startsWith("port:") ? value.slice("port:".length) : value.startsWith("board:") ? value.slice("board:".length) : undefined;
  if (!rest) {
    return undefined;
  }
  const parts = rest.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : rest;
}

function legacyPortId(value: string | undefined): string | undefined {
  if (!value?.startsWith("port:")) {
    return undefined;
  }
  return value.split("/").pop();
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

    return {
      ...result.data,
      pdmCode: result.data.pdmCode ?? result.data.componentCode,
      ports: parsePorts(result.data.ports),
      layerId: result.data.layerId ?? normalizeLayerId(result.data.layer)
    };
  });
}

function parsePorts(value: string | undefined): GraphPort[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed
      .map((entry): GraphPort | undefined => {
        if (!entry || typeof entry !== "object") {
          return undefined;
        }
        const record = entry as Record<string, unknown>;
        const portId = readPortString(record, "port_id") ?? readPortString(record, "portId") ?? readPortString(record, "id");
        if (!portId) {
          return undefined;
        }
        return {
          portId,
          connectorName: readPortString(record, "connector_name") ?? readPortString(record, "connectorName"),
          displayName: readPortString(record, "display_name") ?? readPortString(record, "displayName") ?? portId,
          normalizedName: readPortString(record, "normalized_name") ?? readPortString(record, "normalizedName") ?? portId,
          side: readPortString(record, "side") as GraphPort["side"],
          offset: readPortNumber(record, "offset"),
          x: readPortNumber(record, "x"),
          y: readPortNumber(record, "y"),
          metadata: Object.fromEntries(Object.entries(record).map(([key, raw]) => [key, raw === undefined || raw === null ? undefined : String(raw)]))
        };
      })
      .filter((port): port is GraphPort => Boolean(port));
  } catch {
    return undefined;
  }
}

function mergePorts(existing: GraphPort[] | undefined, next: GraphPort[] | undefined): GraphPort[] | undefined {
  const portsById = new Map<string, GraphPort>();
  for (const port of existing ?? []) {
    portsById.set(port.portId, port);
  }
  for (const port of next ?? []) {
    const current = portsById.get(port.portId);
    portsById.set(port.portId, current ? { ...current, ...port, metadata: { ...current.metadata, ...port.metadata } } : port);
  }
  return portsById.size ? Array.from(portsById.values()) : undefined;
}

function readPortString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function readPortNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
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
