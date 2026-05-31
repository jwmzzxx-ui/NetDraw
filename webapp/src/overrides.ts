import type { PositionedGraph, Position } from "../../src/types.js";

export type OverridePositions = Record<string, Position>;
export type EdgeBendPoints = Record<string, Position[]>;

export interface OverrideRulesPatch {
  layout: {
    overridePositions?: OverridePositions;
    edgeBendPoints?: EdgeBendPoints;
  };
}

export function updateOverridePosition(previous: OverridePositions, nodeId: string, position: Position): OverridePositions {
  return {
    ...previous,
    [nodeId]: normalizePosition(position)
  };
}

export function updateEdgeBendPoints(previous: EdgeBendPoints, edgeId: string, bendPoints: Position[]): EdgeBendPoints {
  return {
    ...previous,
    [edgeId]: bendPoints.map(normalizePosition)
  };
}

export function buildOverrideRulesPatch(positions: OverridePositions, edgeBendPoints: EdgeBendPoints = {}): OverrideRulesPatch {
  const layout: OverrideRulesPatch["layout"] = {};
  if (Object.keys(positions).length > 0) {
    layout.overridePositions = Object.fromEntries(
      Object.entries(positions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nodeId, position]) => [nodeId, normalizePosition(position)])
    );
  }
  if (Object.keys(edgeBendPoints).length > 0) {
    layout.edgeBendPoints = Object.fromEntries(
      Object.entries(edgeBendPoints)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([edgeId, bendPoints]) => [edgeId, bendPoints.map(normalizePosition)])
    );
  }

  return { layout };
}

export function formatOverrideRulesPatch(positions: OverridePositions, edgeBendPoints: EdgeBendPoints = {}): string {
  return JSON.stringify(buildOverrideRulesPatch(positions, edgeBendPoints), null, 2);
}

export function applyOverridePositions(graph: PositionedGraph, positions: OverridePositions, edgeBendPoints: EdgeBendPoints = {}): PositionedGraph {
  if (Object.keys(positions).length === 0 && Object.keys(edgeBendPoints).length === 0) {
    return graph;
  }

  return {
    ...graph,
    rules: {
      ...graph.rules,
      edgeBendPoints: {
        ...graph.rules.edgeBendPoints,
        ...edgeBendPoints
      }
    },
    nodes: graph.nodes.map((node) => {
      const position = positions[node.id];
      return position ? { ...node, position } : node;
    })
  };
}

function normalizePosition(position: Position): Position {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}
