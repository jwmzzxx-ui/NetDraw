import { toSlug } from "./normalizer.js";
import type {
  CableTrace,
  CanonicalGraph,
  GraphEdge,
  GraphIndexes,
  GraphNode,
  InterfaceRow,
  ModelDiagnostic,
  NormalizedInterfaceRow,
  NormalizedName,
  ResolvedCableRoute
} from "./types.js";

export function buildCanonicalGraph(rows: InterfaceRow[], resolvedRoutes: ResolvedCableRoute[] = []): CanonicalGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const routeByCableId = new Map(resolvedRoutes.map((route) => [route.cableId, route]));

  for (const row of rows) {
    const src = addEndpoint(nodes, row, "src");
    const dst = addEndpoint(nodes, row, "dst");
    const cableId = row.cableId || `AUTO-${row.rowId}`;
    const resolvedRoute = routeByCableId.get(cableId);

    edges.push({
      id: `cable:${toSlug(cableId)}`,
      type: "logical-cable",
      source: src.componentId,
      target: dst.componentId,
      sourcePortId: src.port.portId,
      targetPortId: dst.port.portId,
      cableId,
      cableType: row.cableType,
      netType: row.netType,
      medium: row.medium,
      routeHint: row.routeHint,
      routeAlgorithm: resolvedRoute?.algorithm,
      routeNodes: resolvedRoute?.routeNodes,
      routeString: resolvedRoute?.routeString ?? row.routeHint,
      sourceRow: row
    });

    if (resolvedRoute) {
      for (const routeNode of resolvedRoute.routeNodes) {
        addNode(nodes, {
          id: routeNodeId(routeNode),
          type: "route-node",
          layer: "route",
          displayName: routeNode
        });
      }

      resolvedRoute.routeSegments.forEach((segment, index) => {
        edges.push({
          id: `route-segment:${toSlug(cableId)}:${index}`,
          type: "route-segment",
          source: routeNodeId(segment.source),
          target: routeNodeId(segment.target),
          cableId,
          cableType: row.cableType,
          netType: row.netType,
          medium: row.medium,
          routeHint: row.routeHint,
          routeAlgorithm: resolvedRoute.algorithm,
          routeNodes: resolvedRoute.routeNodes,
          routeString: resolvedRoute.routeString,
          segmentIndex: index,
          sourceRow: row
        });
      });
    }
  }

  return createCanonicalGraph(Array.from(nodes.values()), edges);
}

export function createCanonicalGraph(nodes: GraphNode[], edges: GraphEdge[]): CanonicalGraph {
  const { indexes, diagnostics } = buildGraphIndexesAndDiagnostics(nodes, edges);
  return {
    nodes,
    edges,
    indexes,
    diagnostics
  };
}

export function traceCable(graph: CanonicalGraph, cableId: string): CableTrace | undefined {
  const indexes = graph.indexes ?? buildGraphIndexesAndDiagnostics(graph.nodes, graph.edges).indexes;
  const cableIndex = indexes.byCableId[cableId];
  const logicalCableId = cableIndex?.logicalCableEdgeIds[0];
  if (!logicalCableId) {
    return undefined;
  }

  const logicalCable = edgeById(graph, indexes, logicalCableId);
  if (!logicalCable) {
    return undefined;
  }

  const routeSegments = (cableIndex.routeSegmentEdgeIds ?? [])
    .map((edgeId) => edgeById(graph, indexes, edgeId))
    .filter((edge): edge is GraphEdge => Boolean(edge))
    .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));

  return {
    cableId,
    logicalCable,
    sourceComponent: nodeById(graph, indexes, logicalCable.source),
    targetComponent: nodeById(graph, indexes, logicalCable.target),
    sourcePort: nodeById(graph, indexes, logicalCable.source)?.ports?.find((port) => port.portId === logicalCable.sourcePortId),
    targetPort: nodeById(graph, indexes, logicalCable.target)?.ports?.find((port) => port.portId === logicalCable.targetPortId),
    routeSegments,
    routeNodeIds: routeNodeIdsFrom(logicalCable, routeSegments)
  };
}

export function summarizeModelDiagnostics(diagnostics: ModelDiagnostic[]): { errors: number; warnings: number; info: number } {
  return {
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    info: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length
  };
}

export function renderModelDiagnosticsMarkdown(diagnostics: ModelDiagnostic[]): string {
  const summary = summarizeModelDiagnostics(diagnostics);
  const rows = diagnostics.length === 0
    ? ["No model diagnostics found."]
    : diagnostics.map((diagnostic) => {
        const target = diagnostic.edgeId ?? diagnostic.nodeId ?? diagnostic.cableId ?? "graph";
        return `- **${diagnostic.severity.toUpperCase()}** ${diagnostic.code} ${target}: ${diagnostic.message}`;
      });

  return [
    "# NetDraw Model Diagnostics",
    "",
    `Errors: ${summary.errors}`,
    `Warnings: ${summary.warnings}`,
    `Info: ${summary.info}`,
    "",
    "## Diagnostics",
    "",
    ...rows,
    ""
  ].join("\n");
}

function addEndpoint(
  nodes: Map<string, GraphNode>,
  row: InterfaceRow,
  side: "src" | "dst"
): { componentId: string; port: NonNullable<GraphNode["ports"]>[number] } {
  const component = readEndpointName(row, `${side}Component`);
  const port = readEndpointName(row, `${side}Port`);
  const componentId = `component:${component.slug}`;

  addNode(nodes, {
    id: componentId,
    type: "component",
    displayName: component.displayName,
    componentId: component.normalizedName,
    componentName: component.displayName,
    pdmCode: component.normalizedName,
    componentCode: component.normalizedName,
    ports: [graphPortFromName(port)],
    metadata: {
      ...nameMetadata(component),
      componentId: component.normalizedName,
      componentName: component.displayName,
      pdmCode: component.normalizedName,
      componentCode: component.normalizedName
    }
  });

  return { componentId, port: graphPortFromName(port) };
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }

  existing.metadata = mergeMetadata(existing.metadata, node.metadata);
  existing.ports = mergePorts(existing.ports, node.ports);
  existing.componentId = existing.componentId ?? node.componentId;
  existing.componentName = existing.componentName ?? node.componentName;
  existing.pdmCode = existing.pdmCode ?? node.pdmCode;
  existing.componentCode = existing.componentCode ?? node.componentCode;
}

type EndpointField = "srcComponent" | "srcPort" | "dstComponent" | "dstPort";

function readEndpointName(row: InterfaceRow, field: EndpointField): NormalizedName {
  if (isNormalizedInterfaceRow(row)) {
    return row.normalized[field];
  }

  const originalName = String(readRawEndpointValue(row, field)).trim();
  return {
    originalName,
    normalizedName: originalName,
    displayName: originalName,
    slug: toSlug(originalName)
  };
}

function readRawEndpointValue(row: InterfaceRow, field: EndpointField): string {
  if (field === "srcComponent") {
    return row.srcComponent ?? legacyComponentName(row.srcDevice, row.srcBoard);
  }
  if (field === "dstComponent") {
    return row.dstComponent ?? legacyComponentName(row.dstDevice, row.dstBoard);
  }
  return String(row[field] ?? "");
}

function legacyComponentName(device: string | undefined, board: string | undefined): string {
  return [device, board].filter(Boolean).join("/") || device || board || "";
}

function isNormalizedInterfaceRow(row: InterfaceRow): row is NormalizedInterfaceRow {
  return "normalized" in row;
}

function nameMetadata(name: NormalizedName): Record<string, string> {
  return {
    originalNames: name.originalName,
    normalizedName: name.normalizedName
  };
}

function graphPortFromName(port: NormalizedName): NonNullable<GraphNode["ports"]>[number] {
  return {
    portId: port.normalizedName,
    displayName: port.displayName,
    normalizedName: port.normalizedName,
    connectorName: port.displayName,
    metadata: {
      ...nameMetadata(port),
      source: "interface"
    }
  };
}

function mergePorts(
  existing: GraphNode["ports"] | undefined,
  next: GraphNode["ports"] | undefined
): GraphNode["ports"] | undefined {
  const byId = new Map<string, NonNullable<GraphNode["ports"]>[number]>();
  for (const port of existing ?? []) {
    byId.set(port.portId, port);
  }
  for (const port of next ?? []) {
    const current = byId.get(port.portId);
    byId.set(port.portId, current ? { ...current, ...port, metadata: mergeMetadata(current.metadata, port.metadata) } : port);
  }
  return byId.size ? Array.from(byId.values()) : undefined;
}

function mergeMetadata(
  existing: Record<string, string | undefined> | undefined,
  next: Record<string, string | undefined> | undefined
): Record<string, string | undefined> | undefined {
  if (!existing && !next) {
    return undefined;
  }
  if (!existing) {
    return next;
  }
  if (!next) {
    return existing;
  }

  return {
    ...existing,
    ...next,
    originalNames: mergeListValue(existing.originalNames, next.originalNames)
  };
}

function mergeListValue(existing: string | undefined, next: string | undefined): string | undefined {
  const values = new Set(
    [existing, next]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split("|").map((part) => part.trim()).filter(Boolean))
  );
  return Array.from(values).join(" | ");
}

function routeNodeId(value: string): string {
  return `route:${toSlug(value)}`;
}

function buildGraphIndexesAndDiagnostics(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { indexes: GraphIndexes; diagnostics: ModelDiagnostic[] } {
  const diagnostics: ModelDiagnostic[] = [];
  const byId: GraphIndexes["byId"] = {};
  const byCableId: GraphIndexes["byCableId"] = {};
  const byParent: GraphIndexes["byParent"] = {};

  nodes.forEach((node, index) => {
    if (byId[node.id]) {
      diagnostics.push({
        code: "DUPLICATE_ID",
        severity: "error",
        nodeId: node.id,
        message: `Duplicate graph id: ${node.id}`
      });
    }
    byId[node.id] = { kind: "node", index };

  });

  edges.forEach((edge, index) => {
    if (byId[edge.id]) {
      diagnostics.push({
        code: "DUPLICATE_ID",
        severity: "error",
        edgeId: edge.id,
        cableId: edge.cableId,
        message: `Duplicate graph id: ${edge.id}`
      });
    }
    byId[edge.id] = { kind: "edge", index };

    const cableIndex = byCableId[edge.cableId] ?? { logicalCableEdgeIds: [], routeSegmentEdgeIds: [] };
    if (edge.type === "logical-cable") {
      cableIndex.logicalCableEdgeIds.push(edge.id);
    } else {
      cableIndex.routeSegmentEdgeIds.push(edge.id);
    }
    byCableId[edge.cableId] = cableIndex;
  });

  for (const edge of edges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!byId[endpoint] || byId[endpoint].kind !== "node") {
        diagnostics.push({
          code: "MISSING_EDGE_ENDPOINT",
          severity: "error",
          edgeId: edge.id,
          cableId: edge.cableId,
          message: `Edge ${edge.id} references missing endpoint ${endpoint}`
        });
      }
    }
  }

  for (const cableId of Object.keys(byCableId)) {
    byCableId[cableId].logicalCableEdgeIds.sort();
    byCableId[cableId].routeSegmentEdgeIds.sort((left, right) => {
      const leftEdge = edgeById({ nodes, edges }, { byId, byCableId, byParent }, left);
      const rightEdge = edgeById({ nodes, edges }, { byId, byCableId, byParent }, right);
      return (leftEdge?.segmentIndex ?? 0) - (rightEdge?.segmentIndex ?? 0) || left.localeCompare(right);
    });
    diagnostics.push(...routeChainDiagnostics(cableId, nodes, edges, { byId, byCableId, byParent }));
  }

  return {
    indexes: { byId, byCableId, byParent },
    diagnostics
  };
}

function routeChainDiagnostics(
  cableId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  indexes: GraphIndexes
): ModelDiagnostic[] {
  const logicalCable = indexes.byCableId[cableId]?.logicalCableEdgeIds
    .map((edgeId) => edgeById({ nodes, edges }, indexes, edgeId))
    .find((edge): edge is GraphEdge => Boolean(edge));
  if (!logicalCable?.routeNodes?.length) {
    return [];
  }

  const expectedRouteNodeIds = logicalCable.routeNodes.map(routeNodeId);
  const actualRouteNodeIds = routeNodeIdsFrom(
    logicalCable,
    indexes.byCableId[cableId].routeSegmentEdgeIds
      .map((edgeId) => edgeById({ nodes, edges }, indexes, edgeId))
      .filter((edge): edge is GraphEdge => Boolean(edge))
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0))
  );

  return expectedRouteNodeIds.join(">") === actualRouteNodeIds.join(">")
    ? []
    : [
        {
          code: "ROUTE_CHAIN_MISMATCH",
          severity: "warning",
          edgeId: logicalCable.id,
          cableId,
          message: `Cable ${cableId} routeNodes do not match route-segment chain`
        }
      ];
}

function nodeById(graph: CanonicalGraph, indexes: GraphIndexes, nodeId: string): GraphNode | undefined {
  const entry = indexes.byId[nodeId];
  return entry?.kind === "node" ? graph.nodes[entry.index] : undefined;
}

function edgeById(graph: Pick<CanonicalGraph, "nodes" | "edges">, indexes: GraphIndexes, edgeId: string): GraphEdge | undefined {
  const entry = indexes.byId[edgeId];
  return entry?.kind === "edge" ? graph.edges[entry.index] : undefined;
}

function routeNodeIdsFrom(logicalCable: GraphEdge, routeSegments: GraphEdge[]): string[] {
  if (logicalCable.routeNodes?.length) {
    return logicalCable.routeNodes.map(routeNodeId);
  }
  if (routeSegments.length === 0) {
    return [];
  }

  const nodeIds = [routeSegments[0].source];
  for (const segment of routeSegments) {
    nodeIds.push(segment.target);
  }
  return nodeIds;
}
