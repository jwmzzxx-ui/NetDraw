import type { EdgeDefinition, NodeDefinition } from "cytoscape";
import type { GraphEdge, Position, PositionedGraph, PositionedNode } from "../../src/types.js";

export type ViewMode = "overview" | "detail";
const LABEL_ZOOM_THRESHOLD = 1;

export interface GraphViewState {
  netTypes: Set<string>;
  mode: ViewMode;
  highlightedId: string | null;
  zoom: number;
}

export interface CytoscapeElements {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

export function filterGraphForView(graph: PositionedGraph, state: GraphViewState): PositionedGraph {
  const filteredEdges = graph.edges.filter((edge) => {
    if (!state.netTypes.has(edge.netType)) {
      return false;
    }
    return !(state.mode === "overview" && edge.type === "route-segment");
  });
  const edges = state.mode === "overview" ? buildSummaryEdges(filteredEdges) : filteredEdges;
  const referencedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));

  return {
    ...graph,
    nodes: graph.nodes.filter((node) => referencedNodeIds.has(node.id) || node.type !== "route-node"),
    edges
  };
}

export function buildCytoscapeElements(graph: PositionedGraph, state: GraphViewState): CytoscapeElements {
  const filtered = filterGraphForView(graph, state);
  const highlight = buildHighlightState(filtered, state.highlightedId);
  return {
    nodes: filtered.nodes.map((node) => ({
      data: {
        id: node.id,
        label: displayLabel(node, state),
        kind: node.type,
        layer: node.layout.layer,
        parent: node.parent,
        highlighted: highlight.nodeIds.has(node.id)
      },
      position: node.position,
      classes: highlight.nodeIds.has(node.id) ? "is-highlighted-node" : ""
    })),
    edges: filtered.edges.map((edge) => {
      const bendData = buildBendData(filtered, edge);
      const highlighted = highlight.edgeIds.has(edge.id);
      return {
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          kind: edge.type,
          cableId: edge.cableId,
          netType: edge.netType,
          medium: edge.medium,
          routeString: edge.routeString ?? edge.routeHint ?? "",
          highlighted,
          ...bendData
        },
        classes: edgeClasses(edge, highlighted, Boolean(bendData))
      };
    })
  };
}

export function getGraphStats(graph: PositionedGraph): {
  nodes: number;
  logicalCables: number;
  routeSegments: number;
  warnings: number;
} {
  return {
    nodes: graph.nodes.length,
    logicalCables: graph.edges.filter((edge) => edge.type === "logical-cable").length,
    routeSegments: graph.edges.filter((edge) => edge.type === "route-segment").length,
    warnings: graph.warnings.length
  };
}

export function getAvailableNetTypes(graph: PositionedGraph): string[] {
  return Array.from(new Set(graph.edges.map((edge) => edge.netType))).sort();
}

export function buildNodeIndex(graph: PositionedGraph): Map<string, PositionedNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function buildHighlightState(graph: PositionedGraph, highlightedId: string | null): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!highlightedId) {
    return { nodeIds, edgeIds };
  }

  const nodeById = buildNodeIndex(graph);
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const childrenByParent = buildChildrenByParent(graph);
  const selectedNode = nodeById.get(highlightedId);
  const selectedEdge = edgeById.get(highlightedId);

  if (selectedNode) {
    const focusNodeIds = new Set<string>();
    addNodeAndDescendants(highlightedId, childrenByParent, focusNodeIds);
    for (const nodeId of focusNodeIds) {
      nodeIds.add(nodeId);
    }
    for (const edge of graph.edges) {
      if (focusNodeIds.has(edge.source) || focusNodeIds.has(edge.target)) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }
  }

  if (selectedEdge) {
    edgeIds.add(selectedEdge.id);
    nodeIds.add(selectedEdge.source);
    nodeIds.add(selectedEdge.target);
  }

  return { nodeIds, edgeIds };
}

function buildChildrenByParent(graph: PositionedGraph): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parent) {
      continue;
    }
    const children = childrenByParent.get(node.parent) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parent, children);
  }
  return childrenByParent;
}

function addNodeAndDescendants(nodeId: string, childrenByParent: Map<string, string[]>, nodeIds: Set<string>): void {
  nodeIds.add(nodeId);
  for (const childId of childrenByParent.get(nodeId) ?? []) {
    addNodeAndDescendants(childId, childrenByParent, nodeIds);
  }
}

function buildSummaryEdges(edges: GraphEdge[]): GraphEdge[] {
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.type !== "logical-cable") {
      continue;
    }
    const key = `${edge.source}->${edge.target}:${edge.netType}`;
    const group = groups.get(key);
    if (group) {
      group.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    return {
      ...first,
      id: `summary:${first.source}->${first.target}:${first.netType}`,
      cableId: group.length === 1 ? first.cableId : `${group.length} cables`,
      routeHint: group.map((edge) => edge.cableId).join(", "),
      routeString: group.map((edge) => edge.cableId).join(", ")
    };
  });
}

function displayLabel(node: PositionedNode, state: GraphViewState): string {
  if (node.type === "port" && state.mode === "overview") {
    return "";
  }
  if ((node.type === "board" || node.type === "port" || node.type === "route-node") && state.zoom < LABEL_ZOOM_THRESHOLD) {
    return "";
  }
  return node.displayName;
}

function edgeClasses(edge: GraphEdge, highlighted: boolean, hasBends = false): string {
  return [edge.type, `net-${edge.netType.toLowerCase()}`, highlighted ? "is-highlighted" : "", hasBends ? "has-bends" : ""].filter(Boolean).join(" ");
}

function buildBendData(graph: PositionedGraph, edge: GraphEdge): { segmentWeights: number[]; segmentDistances: number[] } | undefined {
  const bends = graph.rules.edgeBendPoints?.[edge.id];
  if (!bends?.length) {
    return undefined;
  }
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return undefined;
  }

  const segmentData = bends.map((bend) => projectBendPoint(source.position, target.position, bend));
  return {
    segmentWeights: segmentData.map((item) => item.weight),
    segmentDistances: segmentData.map((item) => item.distance)
  };
}

function projectBendPoint(source: Position, target: Position, bend: Position): { weight: number; distance: number } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { weight: 0.5, distance: 0 };
  }

  const bx = bend.x - source.x;
  const by = bend.y - source.y;
  const weight = (bx * dx + by * dy) / lengthSquared;
  const distance = (dx * by - dy * bx) / Math.sqrt(lengthSquared);
  return {
    weight: roundForStyle(weight),
    distance: roundForStyle(distance)
  };
}

function roundForStyle(value: number): number {
  return Math.round(value * 1000) / 1000;
}
