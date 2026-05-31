import type { EdgeDefinition, NodeDefinition } from "cytoscape";
import type { GraphEdge, Position, PositionedGraph, PositionedNode } from "../../src/types.js";
import { buildTemplateBackgroundDataUri, DEFAULT_DISPLAY_RULES, resolveDisplayTemplate } from "../../src/displayRules.js";

export type ViewMode = "overview" | "detail";
export type ProjectionMode = "module" | "layer" | "detail";
const LABEL_ZOOM_THRESHOLD = 1;

export interface GraphViewState {
  netTypes: Set<string>;
  mode: ViewMode;
  projection?: ProjectionMode;
  activeModule?: string | null;
  minVisibleLayer?: string;
  highlightedId: string | null;
  zoom: number;
}

export interface CytoscapeElements {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

export function filterGraphForView(graph: PositionedGraph, state: GraphViewState): PositionedGraph {
  const projection = resolveProjection(graph, state);
  const activeModule = state.activeModule ?? null;
  let filteredEdges = graph.edges.filter((edge) => {
    if (!state.netTypes.has(edge.netType)) {
      return false;
    }
    if (activeModule && edge.type !== "logical-cable") {
      return false;
    }
    if (activeModule && !edgeTouchesModule(graph, edge, activeModule)) {
      return false;
    }
    return !(projection !== "detail" && edge.type === "route-segment");
  });
  if (projection === "module") {
    return buildModuleProjection(graph, filteredEdges);
  }
  if (projection === "layer") {
    return buildLayerProjection(graph, filteredEdges, state.minVisibleLayer ?? graph.rules.projectionDefaults?.minVisibleLayer ?? "breakout");
  }

  const edges = state.mode === "overview" ? buildSummaryEdges(filteredEdges) : filteredEdges;
  const referencedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));

  return {
    ...graph,
    nodes: graph.nodes.filter((node) => referencedNodeIds.has(node.id) || (!activeModule && node.type !== "route-node")),
    edges
  };
}

export function buildCytoscapeElements(graph: PositionedGraph, state: GraphViewState): CytoscapeElements {
  const filtered = filterGraphForView(graph, state);
  const highlight = buildHighlightState(filtered, state.highlightedId);
  return {
    nodes: filtered.nodes.map((node) => {
      const template = resolveDisplayTemplate(node, graph.displayRules ?? DEFAULT_DISPLAY_RULES);
      return {
        data: {
          id: node.id,
          label: displayLabel(node, state, template.label),
          kind: node.type,
          layer: node.layout.layer,
          parent: node.parent,
          highlighted: highlight.nodeIds.has(node.id),
          templateId: template.templateId,
          templateWidth: template.width,
          templateHeight: template.height,
          templateShape: template.shape,
          templateFill: template.fill,
          templateStroke: template.stroke,
          templateStrokeWidth: template.strokeWidth ?? 1,
          templateAnchors: template.anchors,
          templateBackground: buildTemplateBackgroundDataUri(template)
        },
        position: node.position,
        classes: [highlight.nodeIds.has(node.id) ? "is-highlighted-node" : "", "has-template", `template-${template.templateId}`].filter(Boolean).join(" ")
      };
    }),
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

export function getAvailableModules(graph: PositionedGraph): string[] {
  return Array.from(new Set(graph.nodes.map((node) => node.layout.module).filter(Boolean))).sort();
}

export function buildNodeIndex(graph: PositionedGraph): Map<string, PositionedNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function resolveProjection(graph: PositionedGraph, state: GraphViewState): ProjectionMode {
  if (state.projection) {
    return state.projection;
  }
  if (state.mode === "detail") {
    return "detail";
  }
  return graph.rules.projectionDefaults?.mode ?? "layer";
}

function buildModuleProjection(graph: PositionedGraph, edges: GraphEdge[]): PositionedGraph {
  const nodeById = buildNodeIndex(graph);
  const nodes = new Map<string, PositionedNode>();
  const projectedEdges = buildSummaryEdges(
    edges
      .filter((edge) => edge.type === "logical-cable")
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) {
          return null;
        }
        const projectedSource = moduleNodeFor(graph, source);
        const projectedTarget = moduleNodeFor(graph, target);
        nodes.set(projectedSource.id, projectedSource);
        nodes.set(projectedTarget.id, projectedTarget);
        return {
          ...edge,
          source: projectedSource.id,
          target: projectedTarget.id
        };
      })
      .filter((edge): edge is GraphEdge => Boolean(edge))
  );

  return { ...graph, nodes: Array.from(nodes.values()), edges: projectedEdges };
}

function buildLayerProjection(graph: PositionedGraph, edges: GraphEdge[], minVisibleLayer: string): PositionedGraph {
  const nodeById = buildNodeIndex(graph);
  const nodes = new Map<string, PositionedNode>();
  const projectedEdges = buildSummaryEdges(
    edges
      .filter((edge) => edge.type === "logical-cable")
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) {
          return null;
        }
        const projectedSource = layerEndpointFor(graph, source, minVisibleLayer);
        const projectedTarget = layerEndpointFor(graph, target, minVisibleLayer);
        nodes.set(projectedSource.id, projectedSource);
        nodes.set(projectedTarget.id, projectedTarget);
        return {
          ...edge,
          source: projectedSource.id,
          target: projectedTarget.id
        };
      })
      .filter((edge): edge is GraphEdge => Boolean(edge))
  );

  return { ...graph, nodes: Array.from(nodes.values()), edges: projectedEdges };
}

function layerEndpointFor(graph: PositionedGraph, node: PositionedNode, minVisibleLayer: string): PositionedNode {
  if (layerRank(node.layout.layer, graph) < layerRank(minVisibleLayer, graph)) {
    return moduleNodeFor(graph, node);
  }
  return layerNodeFor(node);
}

function moduleNodeFor(graph: PositionedGraph, node: PositionedNode): PositionedNode {
  const moduleName = node.layout.module || "UNASSIGNED";
  const moduleNodes = graph.nodes.filter((candidate) => (candidate.layout.module || "UNASSIGNED") === moduleName);
  const position = averagePosition(moduleNodes.length ? moduleNodes : [node]);
  return syntheticNode(`module:${safeId(moduleName)}`, moduleName, node, position, "module");
}

function layerNodeFor(node: PositionedNode): PositionedNode {
  const moduleName = node.layout.module || "UNASSIGNED";
  const boardPath = [node.layout.device, node.layout.board].filter(Boolean).join("/");
  const key = `${moduleName}:${node.layout.layer}:${boardPath || node.layout.device || node.id}`;
  const label = [moduleName, node.layout.layer, boardPath || node.layout.device || node.displayName].filter(Boolean).join(" · ");
  return syntheticNode(`layer:${safeId(key)}`, label, node, node.position, node.layout.layer);
}

function syntheticNode(id: string, displayName: string, source: PositionedNode, position: Position, layer: string): PositionedNode {
  return {
    id,
    type: "device",
    displayName,
    position,
    layout: {
      ...source.layout,
      layer,
      reason: `topology projection for ${displayName}`
    }
  };
}

function edgeTouchesModule(graph: PositionedGraph, edge: GraphEdge, moduleName: string): boolean {
  const nodeById = buildNodeIndex(graph);
  return [edge.source, edge.target].some((nodeId) => nodeById.get(nodeId)?.layout.module === moduleName);
}

function layerRank(layer: string, graph: PositionedGraph): number {
  const index = graph.rules.layerOrder.indexOf(layer);
  return index >= 0 ? index : graph.rules.layerOrder.length;
}

function averagePosition(nodes: PositionedNode[]): Position {
  const total = nodes.reduce(
    (sum, node) => ({ x: sum.x + node.position.x, y: sum.y + node.position.y }),
    { x: 0, y: 0 }
  );
  return {
    x: Math.round(total.x / nodes.length),
    y: Math.round(total.y / nodes.length)
  };
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:/-]+/g, "_");
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

function displayLabel(node: PositionedNode, state: GraphViewState, templateLabel = node.displayName): string {
  if (node.type === "port" && state.mode === "overview") {
    return "";
  }
  if ((node.type === "board" || node.type === "port" || node.type === "route-node") && state.zoom < LABEL_ZOOM_THRESHOLD) {
    return "";
  }
  return templateLabel;
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
