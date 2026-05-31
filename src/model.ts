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
      source: src.portId,
      target: dst.portId,
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
    sourcePort: nodeById(graph, indexes, logicalCable.source),
    targetPort: nodeById(graph, indexes, logicalCable.target),
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
): { deviceId: string; boardId: string; portId: string } {
  const device = readEndpointName(row, `${side}Device`);
  const board = readEndpointName(row, `${side}Board`);
  const port = readEndpointName(row, `${side}Port`);
  const deviceId = `device:${device.slug}`;
  const boardId = `board:${device.slug}/${board.slug}`;
  const portId = `port:${device.slug}/${board.slug}/${port.slug}`;

  addNode(nodes, {
    id: deviceId,
    type: "device",
    displayName: device.displayName,
    metadata: nameMetadata(device)
  });
  addNode(nodes, {
    id: boardId,
    type: "board",
    parent: deviceId,
    displayName: board.displayName,
    metadata: nameMetadata(board)
  });
  addNode(nodes, {
    id: portId,
    type: "port",
    parent: boardId,
    displayName: port.displayName,
    metadata: nameMetadata(port)
  });

  return { deviceId, boardId, portId };
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }

  existing.metadata = mergeMetadata(existing.metadata, node.metadata);
}

function readEndpointName(row: InterfaceRow, field: keyof NormalizedInterfaceRow["normalized"]): NormalizedName {
  if (isNormalizedInterfaceRow(row)) {
    return row.normalized[field];
  }

  const originalName = String(row[field]).trim();
  return {
    originalName,
    normalizedName: originalName,
    displayName: originalName,
    slug: toSlug(originalName)
  };
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

    if (node.parent) {
      const children = byParent[node.parent] ?? [];
      children.push(node.id);
      byParent[node.parent] = children;
    }
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

  for (const node of nodes) {
    if (node.parent && !byId[node.parent]) {
      diagnostics.push({
        code: "MISSING_PARENT",
        severity: "error",
        nodeId: node.id,
        message: `Node ${node.id} references missing parent ${node.parent}`
      });
    }
  }

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
