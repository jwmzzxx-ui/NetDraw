import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { buildCytoscapeElements, filterGraphForView } from "../webapp/src/graphAdapter.js";
import { writeCableListArtifacts } from "./exportCableList.js";
import { createPresetLayout, DEFAULT_LAYOUT_RULES } from "./layout.js";
import { buildCanonicalGraph } from "./model.js";
import type { CanonicalGraph, InterfaceRow, LayerType, NetType, PositionedGraph, ResolvedCableRoute } from "./types.js";

export interface SyntheticNetworkOptions {
  cableCount: number;
  averageRouteHop: number;
  redundancyRatio: number;
  loopRatio: number;
}

export interface SyntheticNetworkSummary {
  cableCount: number;
  routeSegmentCount: number;
  netTypes: string[];
  layers: string[];
  redundantCableCount: number;
  loopCableCount: number;
}

export interface SyntheticNetwork {
  rows: InterfaceRow[];
  resolvedRoutes: ResolvedCableRoute[];
  graph: CanonicalGraph;
  positionedGraph: PositionedGraph;
  summary: SyntheticNetworkSummary;
}

export interface VisualCorrectnessSummary {
  overviewEdges: number;
  detailEdges: number;
  overviewPortLabelsHidden: boolean;
  netTypes: string[];
}

export interface SyntheticBenchmarkReport {
  options: SyntheticNetworkOptions;
  summary: SyntheticNetworkSummary;
  visual: VisualCorrectnessSummary;
  metrics: {
    initialRenderTime: number;
    expandDetailTime: number;
    exportTime: number;
    peakHeapMb: number;
  };
}

export interface BenchmarkRunOptions {
  outDir: string;
}

export const BENCHMARK_PRESETS = {
  "medium-1000": {
    cableCount: 1000,
    averageRouteHop: 2,
    redundancyRatio: 0.1,
    loopRatio: 0.02
  },
  "large-5000": {
    cableCount: 5000,
    averageRouteHop: 2,
    redundancyRatio: 0.1,
    loopRatio: 0.02
  },
  "stress-5000-hops5": {
    cableCount: 5000,
    averageRouteHop: 5,
    redundancyRatio: 0.1,
    loopRatio: 0.02
  }
} as const satisfies Record<string, SyntheticNetworkOptions>;

export type BenchmarkPresetName = keyof typeof BENCHMARK_PRESETS;

const layerSpecs: Array<{ layer: Exclude<LayerType, "route">; prefix: string; board: string }> = [
  { layer: "part", prefix: "PART", board: "PART_BOARD" },
  { layer: "breakout", prefix: "BRK", board: "BREAKOUT_BOARD" },
  { layer: "interface", prefix: "IFACE", board: "INTERFACE_BOARD" },
  { layer: "control", prefix: "CTRL", board: "CONTROL_BOARD" },
  { layer: "switch", prefix: "SW", board: "SWITCH_CARD" },
  { layer: "ipc", prefix: "IPC", board: "IPC_IO" }
];
const netTypes: NetType[] = ["AC", "DC", "COMM", "SIGNAL", "SAFETY"];

export function getBenchmarkPreset(name: BenchmarkPresetName): SyntheticNetworkOptions {
  const preset = BENCHMARK_PRESETS[name];
  return { ...preset };
}

export function generateSyntheticNetwork(options: SyntheticNetworkOptions): SyntheticNetwork {
  const cableCount = Math.max(0, Math.floor(options.cableCount));
  const routeHopCount = Math.max(0, Math.floor(options.averageRouteHop));
  const redundantCableCount = Math.floor(cableCount * clampRatio(options.redundancyRatio));
  const loopCableCount = Math.floor(cableCount * clampRatio(options.loopRatio));
  const rows: InterfaceRow[] = [];
  const resolvedRoutes: ResolvedCableRoute[] = [];

  for (let index = 0; index < cableCount; index += 1) {
    const cableId = `SYN-${String(index + 1).padStart(5, "0")}`;
    const sourceSpec = layerSpecs[index % layerSpecs.length];
    const isLoop = index < loopCableCount;
    const targetSpec = isLoop ? layerSpecs[(index + layerSpecs.length - 1) % layerSpecs.length] : layerSpecs[(index + 1) % layerSpecs.length];
    const srcOrdinal = index % 160;
    const dstOrdinal = (index * 7 + 3) % 160;
    const netType = netTypes[index % netTypes.length];
    const routeNodes = Array.from({ length: routeHopCount + 1 }, (_, hop) => `TRAY_${(index + hop) % Math.max(64, routeHopCount * 32)}`);
    const routeSegments = routeNodes.slice(0, -1).map((node, hop) => ({
      source: node,
      target: routeNodes[hop + 1],
      cost: 1
    }));

    rows.push({
      rowId: `SYN-${index + 1}`,
      srcDevice: `${sourceSpec.prefix}_${srcOrdinal}`,
      srcBoard: sourceSpec.board,
      srcPort: `P${srcOrdinal}`,
      dstDevice: `${targetSpec.prefix}_${dstOrdinal}`,
      dstBoard: targetSpec.board,
      dstPort: `P${dstOrdinal}`,
      netType,
      medium: mediumFor(netType, index),
      cableId,
      cableType: cableTypeFor(netType),
      routeHint: routeNodes.join(">"),
      redundancyGroup: index < redundantCableCount ? `RED-${Math.floor(index / 2) + 1}` : undefined,
      direction: isLoop ? "loop-test" : "forward",
      remarks: isLoop ? "synthetic loop cable" : "synthetic benchmark cable"
    });

    resolvedRoutes.push({
      cableId,
      algorithm: "explicit",
      routeNodes,
      routeSegments,
      routeString: routeNodes.join(">")
    });
  }

  const graph = assignSyntheticLayers(buildCanonicalGraph(rows, resolvedRoutes));
  const positionedGraph = createPresetLayout(graph, DEFAULT_LAYOUT_RULES);
  const layerSet = new Set(graph.nodes.flatMap((node) => (node.layer && node.layer !== "route" ? [node.layer] : [])));
  const netTypeSet = new Set(rows.map((row) => row.netType));
  const layers = layerSpecs.map((spec) => spec.layer).filter((layer) => layerSet.has(layer));
  const usedNetTypes = netTypes.filter((netType) => netTypeSet.has(netType));

  return {
    rows,
    resolvedRoutes,
    graph,
    positionedGraph,
    summary: {
      cableCount,
      routeSegmentCount: resolvedRoutes.reduce((total, route) => total + route.routeSegments.length, 0),
      netTypes: usedNetTypes,
      layers,
      redundantCableCount,
      loopCableCount
    }
  };
}

export function summarizeVisualCorrectness(positionedGraph: PositionedGraph): VisualCorrectnessSummary {
  const netTypes = new Set(positionedGraph.edges.map((edge) => edge.netType));
  const overviewState = { netTypes, mode: "overview" as const, highlightedId: null, zoom: 0.5 };
  const detailState = { netTypes, mode: "detail" as const, highlightedId: null, zoom: 1.2 };
  const overview = filterGraphForView(positionedGraph, overviewState);
  const detail = filterGraphForView(positionedGraph, detailState);
  const overviewElements = buildCytoscapeElements(positionedGraph, overviewState);

  return {
    overviewEdges: overview.edges.length,
    detailEdges: detail.edges.length,
    overviewPortLabelsHidden: overviewElements.nodes
      .filter((node) => node.data.kind === "port")
      .every((node) => node.data.label === ""),
    netTypes: netTypesFromEdges(positionedGraph)
  };
}

export async function runSyntheticBenchmark(options: SyntheticNetworkOptions, runOptions: BenchmarkRunOptions): Promise<SyntheticBenchmarkReport> {
  await mkdir(runOptions.outDir, { recursive: true });
  const synthetic = generateSyntheticNetwork(options);
  const netTypes = new Set(synthetic.positionedGraph.edges.map((edge) => edge.netType));
  const peakHeap = () => process.memoryUsage().heapUsed / 1024 / 1024;
  let peakHeapMb = peakHeap();

  const initialStartedAt = performance.now();
  buildCytoscapeElements(synthetic.positionedGraph, { netTypes, mode: "overview", highlightedId: null, zoom: 0.5 });
  const initialRenderTime = performance.now() - initialStartedAt;
  peakHeapMb = Math.max(peakHeapMb, peakHeap());

  const detailStartedAt = performance.now();
  buildCytoscapeElements(synthetic.positionedGraph, { netTypes, mode: "detail", highlightedId: null, zoom: 1.2 });
  const expandDetailTime = performance.now() - detailStartedAt;
  peakHeapMb = Math.max(peakHeapMb, peakHeap());

  const exportStartedAt = performance.now();
  await writeCableListArtifacts(synthetic.graph, runOptions.outDir, { fileBaseName: "benchmark-cables" });
  const exportTime = performance.now() - exportStartedAt;
  peakHeapMb = Math.max(peakHeapMb, peakHeap());

  const report: SyntheticBenchmarkReport = {
    options,
    summary: synthetic.summary,
    visual: summarizeVisualCorrectness(synthetic.positionedGraph),
    metrics: {
      initialRenderTime,
      expandDetailTime,
      exportTime,
      peakHeapMb
    }
  };

  await writeFile(join(runOptions.outDir, "benchmark-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function assignSyntheticLayers(graph: CanonicalGraph): CanonicalGraph {
  return {
    nodes: graph.nodes.map((node) => {
      if (node.type === "route-node") {
        return node;
      }
      const deviceName = deviceFromNodeId(node.id);
      const spec = layerSpecs.find((candidate) => deviceName.startsWith(`${candidate.prefix}_`));
      if (!spec) {
        return node;
      }
      return {
        ...node,
        layer: spec.layer,
        metadata: {
          ...node.metadata,
          layer: spec.layer,
          order: String(ordinalFromName(deviceName) % 160)
        }
      };
    }),
    edges: graph.edges
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function deviceFromNodeId(nodeId: string): string {
  return nodeId.split(":")[1]?.split("/")[0] ?? "";
}

function ordinalFromName(name: string): number {
  const value = Number(name.split("_").at(-1));
  return Number.isFinite(value) ? value : 0;
}

function mediumFor(netType: NetType, index: number): string {
  if (netType === "AC" || netType === "DC") {
    return "power";
  }
  if (netType === "COMM") {
    return index % 2 === 0 ? "ethernet" : "fiber";
  }
  return netType === "SAFETY" ? "safety" : "shielded";
}

function cableTypeFor(netType: NetType): string {
  const types: Record<NetType, string> = {
    AC: "3C2.5",
    DC: "2C1.5",
    COMM: "CAT6",
    SIGNAL: "SHIELDED-PAIR",
    SAFETY: "SAFETY-RATED"
  };
  return types[netType];
}

function netTypesFromEdges(positionedGraph: PositionedGraph): NetType[] {
  const used = new Set(positionedGraph.edges.map((edge) => edge.netType));
  return netTypes.filter((netType) => used.has(netType));
}
