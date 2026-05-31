import type { GraphEdge, InterfaceRow, LayoutRules, NetType, PositionedGraph, PositionedNode } from "../../src/types.js";

export interface BenchmarkMetrics {
  parseTime: number;
  graphBuildTime: number;
  renderInitTime: number;
  expandDetailTime: number;
  exportTime: number;
}

export interface SyntheticGraphOptions {
  cableCount: number;
  averageRouteHop: number;
}

const netTypes: NetType[] = ["AC", "DC", "COMM", "SIGNAL", "SAFETY"];

export function createBenchmarkMetrics(overrides: Partial<BenchmarkMetrics> = {}): BenchmarkMetrics {
  return {
    parseTime: 0,
    graphBuildTime: 0,
    renderInitTime: 0,
    expandDetailTime: 0,
    exportTime: 0,
    ...overrides
  };
}

export function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

export function generateSyntheticPositionedGraph(options: SyntheticGraphOptions): PositionedGraph {
  const cableCount = Math.max(0, Math.floor(options.cableCount));
  const routeHopCount = Math.max(0, Math.floor(options.averageRouteHop));
  const endpointPoolSize = Math.max(120, Math.ceil(Math.sqrt(Math.max(cableCount, 1))) * 2);
  const routePoolSize = Math.max(64, routeHopCount * 24);
  const rules: LayoutRules = {
    layerOrder: ["part", "control", "route"],
    dx: 180,
    dy: 28,
    cabinetGap: 1000,
    slotGap: 100,
    boardGap: 10
  };
  const nodes: PositionedNode[] = [];

  for (let index = 0; index < endpointPoolSize; index += 1) {
    nodes.push(makePortNode(`SRC_${index}`, "SRC", `P${index}`, "part", index, 0));
    nodes.push(makePortNode(`DST_${index}`, "DST", `P${index}`, "control", index, 560));
  }
  for (let index = 0; index < routePoolSize; index += 1) {
    nodes.push({
      id: `route:TRAY_${index}`,
      type: "route-node",
      displayName: `TRAY_${index}`,
      position: { x: 280 + (index % 12) * 58, y: 80 + Math.floor(index / 12) * 34 },
      layout: {
        layer: "route",
        cabinet: "",
        slot: "",
        device: `TRAY_${index}`,
        board: "",
        order: index,
        reason: "synthetic benchmark route node"
      }
    });
  }

  const edges: GraphEdge[] = [];
  for (let index = 0; index < cableCount; index += 1) {
    const netType = netTypes[index % netTypes.length];
    const source = `port:SRC_${index % endpointPoolSize}/SRC/P${index % endpointPoolSize}`;
    const target = `port:DST_${(index * 7) % endpointPoolSize}/DST/P${(index * 7) % endpointPoolSize}`;
    const cableId = `SYN-${String(index + 1).padStart(5, "0")}`;
    const sourceRow = makeInterfaceRow(index, netType, cableId);
    edges.push({
      id: `cable:${cableId}`,
      type: "logical-cable",
      source,
      target,
      cableId,
      netType,
      medium: index % 3 === 0 ? "fiber" : "copper",
      routeString: routeHopCount > 0 ? routeString(index, routeHopCount, routePoolSize) : "",
      sourceRow
    });

    for (let hop = 0; hop < routeHopCount; hop += 1) {
      const from = hop === 0 ? source : `route:TRAY_${(index + hop - 1) % routePoolSize}`;
      const to = hop === routeHopCount - 1 ? target : `route:TRAY_${(index + hop) % routePoolSize}`;
      edges.push({
        id: `route-segment:${cableId}:${hop}`,
        type: "route-segment",
        source: from,
        target: to,
        cableId,
        netType,
        medium: index % 3 === 0 ? "fiber" : "copper",
        routeString: routeString(index, routeHopCount, routePoolSize),
        segmentIndex: hop,
        sourceRow
      });
    }
  }

  return { nodes, edges, warnings: [], rules };
}

function makePortNode(device: string, board: string, port: string, layer: string, order: number, x: number): PositionedNode {
  return {
    id: `port:${device}/${board}/${port}`,
    type: "port",
    displayName: port,
    position: { x, y: 40 + order * 22 },
    layout: {
      layer,
      cabinet: "",
      slot: "",
      device,
      board,
      order,
      reason: "synthetic benchmark endpoint"
    }
  };
}

function makeInterfaceRow(index: number, netType: NetType, cableId: string): InterfaceRow {
  const srcIndex = index % 120;
  const dstIndex = (index * 7) % 120;
  return {
    rowId: `SYN-${index + 1}`,
    srcDevice: `SRC_${srcIndex}`,
    srcBoard: "SRC",
    srcPort: `P${srcIndex}`,
    dstDevice: `DST_${dstIndex}`,
    dstBoard: "DST",
    dstPort: `P${dstIndex}`,
    netType,
    medium: index % 3 === 0 ? "fiber" : "copper",
    cableId
  };
}

function routeString(index: number, routeHopCount: number, routePoolSize: number): string {
  return Array.from({ length: routeHopCount }, (_, hop) => `TRAY_${(index + hop) % routePoolSize}`).join(">");
}
