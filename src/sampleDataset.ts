import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ProjectRulesInput } from "./rulesConfig.js";
import { generateSyntheticNetwork, type SyntheticNetworkOptions } from "./testkit.js";
import type { ComponentRow, InterfaceRow, RouteResourceEdge } from "./types.js";

export interface SampleDatasetOptions {
  outDir: string;
}

export interface MainSampleMetadata {
  rowCount: number;
  routeEdgeCount: number;
  componentCount: number;
}

const MAIN_SAMPLE_NAME = "1200";
const MAIN_OPTIONS: SyntheticNetworkOptions = {
  cableCount: 1200,
  averageRouteHop: 4,
  redundancyRatio: 0.1,
  loopRatio: 0
};

const mainRules: ProjectRulesInput = {
  routing: {
    preferAStar: false
  },
  layout: {
    dx: 280,
    dy: 28,
    cabinetGap: 920,
    slotGap: 116,
    boardGap: 26
  },
  style: {
    netTypes: {
      AC: { color: "#aa3300", width: 5 },
      COMM: { lineStyle: "dashed" },
      SAFETY: { color: "#d1242f", width: 4 }
    }
  },
  export: {
    fileBaseName: "generated-sample-cables"
  }
};

export async function generateSampleDataset(options: SampleDatasetOptions): Promise<MainSampleMetadata> {
  await rm(options.outDir, { recursive: true, force: true });
  const mainDir = join(options.outDir, "main");
  const anomaliesDir = join(options.outDir, "anomalies");
  await mkdir(mainDir, { recursive: true });
  await mkdir(anomaliesDir, { recursive: true });

  const synthetic = generateSyntheticNetwork(MAIN_OPTIONS);
  const routes = buildRouteResources(synthetic.rows);
  const components = buildComponentsCsvRows(synthetic.positionedGraph.nodes);

  const interfacePath = join(mainDir, `interfaces-${MAIN_SAMPLE_NAME}.csv`);
  const routesPath = join(mainDir, `routes-${MAIN_SAMPLE_NAME}.csv`);
  const componentsPath = join(mainDir, `components-${MAIN_SAMPLE_NAME}.csv`);
  const rulesPath = join(mainDir, `rules-${MAIN_SAMPLE_NAME}.json`);

  await writeFile(interfacePath, `${serializeCsv(interfaceHeaders, synthetic.rows.map(interfaceRowToCsvRow))}\n`, "utf8");
  await writeFile(routesPath, `${serializeCsv(routeHeaders, routes.map(routeRowToCsvRow))}\n`, "utf8");
  await writeFile(componentsPath, `${serializeCsv(componentHeaders, components.map(componentRowToCsvRow))}\n`, "utf8");
  await writeFile(rulesPath, `${JSON.stringify(mainRules, null, 2)}\n`, "utf8");
  await writeGeneratedReadme(join(options.outDir, "README.md"));
  await copyAnomalySamples(anomaliesDir);

  return {
    rowCount: synthetic.rows.length,
    routeEdgeCount: routes.length,
    componentCount: components.length
  };
}

async function writeGeneratedReadme(filePath: string): Promise<void> {
  const content = [
    "# NetDraw Generated Samples",
    "",
    "## Main sample import order",
    "",
    "- `Interface table` -> `main/interfaces-1200.csv`",
    "- `Routes table` -> `main/routes-1200.csv`",
    "- `Components table` -> `main/components-1200.csv`",
    "- `Rules file` -> `main/rules-1200.json`",
    "",
    "## Anomalies",
    "",
    "- `anomalies/duplicate-row.csv`",
    "- `anomalies/broken-route.csv` with `anomalies/broken-route-routes.csv`",
    "- `anomalies/unknown-component.csv` with `anomalies/unknown-component-components.csv`",
    "- `anomalies/cycle-warning.csv`",
    ""
  ].join("\n");
  await writeFile(filePath, content, "utf8");
}

async function copyAnomalySamples(outDir: string): Promise<void> {
  await copyFile("samples/interfaces-duplicate-row.csv", join(outDir, "duplicate-row.csv"));
  await copyFile("samples/interfaces-route-broken.csv", join(outDir, "broken-route.csv"));
  await copyFile("samples/routes-broken.csv", join(outDir, "broken-route-routes.csv"));
  await copyFile("samples/interfaces.csv", join(outDir, "unknown-component.csv"));
  await copyFile("samples/components-unknown.csv", join(outDir, "unknown-component-components.csv"));
  await copyFile("samples/interfaces-cycle.csv", join(outDir, "cycle-warning.csv"));
}

async function copyFile(fromPath: string, toPath: string): Promise<void> {
  await mkdir(dirname(toPath), { recursive: true });
  await writeFile(toPath, await readFile(fromPath));
}

function buildRouteResources(rows: InterfaceRow[]): RouteResourceEdge[] {
  const routeNodes = Array.from(
    new Set(
      rows.flatMap((row) =>
        (row.routeHint ?? "")
          .split(">")
          .map((part) => part.trim())
          .filter(Boolean)
      )
    )
  );
  const routePositions = new Map(
    routeNodes.map((routeNode, index) => [
      routeNode,
      {
        x: (index % 32) * 120,
        y: Math.floor(index / 32) * 80
      }
    ])
  );
  const resources = new Map<string, RouteResourceEdge>();

  for (const row of rows) {
    const routeNodesForRow = (row.routeHint ?? "")
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean);
    for (let index = 0; index < routeNodesForRow.length - 1; index += 1) {
      const fromRouteNode = routeNodesForRow[index];
      const toRouteNode = routeNodesForRow[index + 1];
      const key = `${fromRouteNode}->${toRouteNode}`;
      if (resources.has(key)) {
        continue;
      }
      resources.set(key, {
        fromRouteNode,
        toRouteNode,
        cost: 1,
        zone: `ZONE-${Math.floor(index / 2) + 1}`,
        fromPosition: routePositions.get(fromRouteNode),
        toPosition: routePositions.get(toRouteNode)
      });
    }
  }

  return Array.from(resources.values());
}

function buildComponentsCsvRows(
  nodes: Array<{
    id: string;
    type: string;
    displayName: string;
    layout: { layer: string; cabinet: string; slot: string; order: number };
  }>
): ComponentRow[] {
  return nodes.map((node) => ({
    nodeId: node.id,
    componentType: node.type,
    layer: node.layout.layer as ComponentRow["layer"],
    cabinet: node.layout.cabinet || `CAB-${node.layout.layer.toUpperCase()}`,
    slot: node.layout.slot || `SLOT-${node.layout.layer.toUpperCase()}`,
    order: String(node.layout.order),
    displayName: node.displayName,
    remarks: `generated sample ${node.type}`
  }));
}

const interfaceHeaders = [
  "row_id",
  "src_device",
  "src_board",
  "src_port",
  "dst_device",
  "dst_board",
  "dst_port",
  "net_type",
  "medium",
  "cable_id",
  "cable_type",
  "route_hint",
  "redundancy_group",
  "direction",
  "remarks"
];

const routeHeaders = ["from_route_node", "to_route_node", "cost", "zone", "from_x", "from_y", "to_x", "to_y"];
const componentHeaders = ["node_id", "type", "layer", "cabinet", "slot", "order", "display_name", "remarks"];

function interfaceRowToCsvRow(row: InterfaceRow): string[] {
  return [
    row.rowId,
    row.srcDevice,
    row.srcBoard,
    row.srcPort,
    row.dstDevice,
    row.dstBoard,
    row.dstPort,
    row.netType,
    row.medium,
    row.cableId ?? "",
    row.cableType ?? "",
    row.routeHint ?? "",
    row.redundancyGroup ?? "",
    row.direction ?? "",
    row.remarks ?? ""
  ];
}

function routeRowToCsvRow(route: RouteResourceEdge): string[] {
  return [
    route.fromRouteNode,
    route.toRouteNode,
    String(route.cost),
    route.zone ?? "",
    route.fromPosition ? String(route.fromPosition.x) : "",
    route.fromPosition ? String(route.fromPosition.y) : "",
    route.toPosition ? String(route.toPosition.x) : "",
    route.toPosition ? String(route.toPosition.y) : ""
  ];
}

function componentRowToCsvRow(component: ComponentRow): string[] {
  return [
    component.nodeId,
    component.componentType,
    component.layer ?? "",
    component.cabinet ?? "",
    component.slot ?? "",
    component.order ?? "",
    component.displayName ?? "",
    component.remarks ?? ""
  ];
}

function serializeCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function generatedMainSamplePaths(rootDir = "samples/generated/main"): {
  interfacePath: string;
  routesPath: string;
  componentsPath: string;
  rulesPath: string;
} {
  return {
    interfacePath: join(rootDir, `interfaces-${MAIN_SAMPLE_NAME}.csv`),
    routesPath: join(rootDir, `routes-${MAIN_SAMPLE_NAME}.csv`),
    componentsPath: join(rootDir, `components-${MAIN_SAMPLE_NAME}.csv`),
    rulesPath: join(rootDir, `rules-${MAIN_SAMPLE_NAME}.json`)
  };
}

export function generatedAnomalyFileNames(): string[] {
  return [
    "duplicate-row.csv",
    "broken-route.csv",
    "broken-route-routes.csv",
    "unknown-component.csv",
    "unknown-component-components.csv",
    "cycle-warning.csv"
  ];
}

export function generatedReadmeFileName(): string {
  return basename("README.md");
}
