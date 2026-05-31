import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import type { InterfaceRow, Position, ResolvedCableRoute, RouteResourceEdge, RouteSegment } from "./types.js";

type RawRouteRecord = Record<string, unknown>;
export interface ResolveCableRouteOptions {
  preferAStar?: boolean;
}

export function parseRoutesCsv(csv: string): RouteResourceEdge[] {
  const parsed = Papa.parse<RawRouteRecord>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`Routes CSV parse error at row ${firstError.row ?? "unknown"}: ${firstError.message}`);
  }

  return parsed.data.map((record, index) => {
    const fromRouteNode = readRouteField(record, ["from_route_node", "fromRouteNode", "from", "source"]);
    const toRouteNode = readRouteField(record, ["to_route_node", "toRouteNode", "to", "target"]);
    if (!fromRouteNode || !toRouteNode) {
      throw new Error(`Invalid route resource row ${index + 1}: fromRouteNode and toRouteNode are required`);
    }

    const costText = readRouteField(record, ["cost", "weight"]);
    const cost = costText ? Number(costText) : 1;
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error(`Invalid route resource row ${index + 1}: cost must be a positive number`);
    }

    const capacityText = readRouteField(record, ["capacity"]);
    const capacity = capacityText ? Number(capacityText) : undefined;
    const routeEdge: RouteResourceEdge = {
      fromRouteNode,
      toRouteNode,
      cost
    };

    const zone = readRouteField(record, ["zone"]);
    if (zone) {
      routeEdge.zone = zone;
    }
    if (Number.isFinite(capacity)) {
      routeEdge.capacity = capacity;
    }
    const fromPosition = readPosition(record, ["from_x", "fromX", "source_x", "sourceX"], ["from_y", "fromY", "source_y", "sourceY"]);
    const toPosition = readPosition(record, ["to_x", "toX", "target_x", "targetX"], ["to_y", "toY", "target_y", "targetY"]);
    if (fromPosition) {
      routeEdge.fromPosition = fromPosition;
    }
    if (toPosition) {
      routeEdge.toPosition = toPosition;
    }

    return routeEdge;
  });
}

export async function parseRoutesFile(filePath: string): Promise<RouteResourceEdge[]> {
  return parseRoutesCsv(await readFile(filePath, "utf8"));
}

export function resolveCableRoutes(
  rows: InterfaceRow[],
  routeResources: RouteResourceEdge[] = [],
  options: ResolveCableRouteOptions = {}
): ResolvedCableRoute[] {
  return rows
    .filter((row) => row.routeHint?.trim())
    .map((row) => resolveCableRoute(row, routeResources, options));
}

function resolveCableRoute(
  row: InterfaceRow,
  routeResources: RouteResourceEdge[],
  options: ResolveCableRouteOptions
): ResolvedCableRoute {
  const cableId = row.cableId || `AUTO-${row.rowId}`;
  const anchors = splitRouteHint(row.routeHint);

  if (anchors.length < 2) {
    return {
      cableId,
      algorithm: "explicit",
      routeNodes: anchors,
      routeSegments: [],
      routeString: anchors.join(">")
    };
  }

  const pathResult = routeResources.length > 0
    ? expandAnchorsByShortestPath(anchors, routeResources, options)
    : { routeNodes: anchors, algorithm: "explicit" as const };
  const routeNodes = pathResult.routeNodes;
  const routeSegments = routeNodes.slice(0, -1).map<RouteSegment>((source, index) => ({
    source,
    target: routeNodes[index + 1],
    cost: findDirectCost(source, routeNodes[index + 1], routeResources) ?? 1
  }));

  return {
    cableId,
    algorithm: pathResult.algorithm,
    routeNodes,
    routeSegments,
    routeString: routeNodes.join(">")
  };
}

function expandAnchorsByShortestPath(
  anchors: string[],
  routeResources: RouteResourceEdge[],
  options: ResolveCableRouteOptions
): { routeNodes: string[]; algorithm: "dijkstra" | "astar" } {
  const expanded: string[] = [anchors[0]];
  const useAStar = Boolean(options.preferAStar && hasCompleteRouteGeometry(routeResources));
  const algorithm = useAStar ? "astar" : "dijkstra";

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    const path = useAStar ? aStarPath(start, end, routeResources) : shortestPath(start, end, routeResources);
    if (!path) {
      throw new Error(`No route path from ${start} to ${end}`);
    }
    expanded.push(...path.slice(1));
  }

  return { routeNodes: expanded, algorithm };
}

function shortestPath(start: string, end: string, routeResources: RouteResourceEdge[]): string[] | undefined {
  const adjacency = buildAdjacency(routeResources);
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const unsettled = new Set<string>([start]);

  while (unsettled.size > 0) {
    const current = minByDistance(unsettled, distances);
    unsettled.delete(current);

    if (current === end) {
      return reconstructPath(previous, start, end);
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      const nextDistance = (distances.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.cost;
      if (nextDistance < (distances.get(neighbor.node) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.node, nextDistance);
        previous.set(neighbor.node, current);
        unsettled.add(neighbor.node);
      }
    }
  }

  return undefined;
}

function aStarPath(start: string, end: string, routeResources: RouteResourceEdge[]): string[] | undefined {
  const adjacency = buildAdjacency(routeResources);
  const positions = buildPositionMap(routeResources);
  const open = new Set<string>([start]);
  const gScore = new Map<string, number>([[start, 0]]);
  const fScore = new Map<string, number>([[start, heuristic(start, end, positions)]]);
  const previous = new Map<string, string>();

  while (open.size > 0) {
    const current = minByDistance(open, fScore);
    if (current === end) {
      return reconstructPath(previous, start, end);
    }
    open.delete(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const nextScore = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.cost;
      if (nextScore < (gScore.get(neighbor.node) ?? Number.POSITIVE_INFINITY)) {
        previous.set(neighbor.node, current);
        gScore.set(neighbor.node, nextScore);
        fScore.set(neighbor.node, nextScore + heuristic(neighbor.node, end, positions));
        open.add(neighbor.node);
      }
    }
  }

  return undefined;
}

function buildAdjacency(routeResources: RouteResourceEdge[]): Map<string, Array<{ node: string; cost: number }>> {
  const adjacency = new Map<string, Array<{ node: string; cost: number }>>();

  for (const edge of routeResources) {
    addAdjacent(adjacency, edge.fromRouteNode, edge.toRouteNode, edge.cost);
    addAdjacent(adjacency, edge.toRouteNode, edge.fromRouteNode, edge.cost);
  }

  return adjacency;
}

function addAdjacent(
  adjacency: Map<string, Array<{ node: string; cost: number }>>,
  from: string,
  to: string,
  cost: number
): void {
  const edges = adjacency.get(from) ?? [];
  edges.push({ node: to, cost });
  adjacency.set(from, edges);
}

function buildPositionMap(routeResources: RouteResourceEdge[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const edge of routeResources) {
    if (edge.fromPosition) {
      positions.set(edge.fromRouteNode, edge.fromPosition);
    }
    if (edge.toPosition) {
      positions.set(edge.toRouteNode, edge.toPosition);
    }
  }
  return positions;
}

function hasCompleteRouteGeometry(routeResources: RouteResourceEdge[]): boolean {
  return routeResources.length > 0 && routeResources.every((edge) => edge.fromPosition && edge.toPosition);
}

function heuristic(node: string, end: string, positions: Map<string, Position>): number {
  const position = positions.get(node);
  const endPosition = positions.get(end);
  if (!position || !endPosition) {
    return 0;
  }

  return Math.hypot(position.x - endPosition.x, position.y - endPosition.y);
}

function minByDistance(nodes: Set<string>, distances: Map<string, number>): string {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const distance = distances.get(node) ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  if (!best) {
    throw new Error("Dijkstra invariant failed: unsettled node set is empty");
  }

  return best;
}

function reconstructPath(previous: Map<string, string>, start: string, end: string): string[] {
  const path = [end];
  let current = end;

  while (current !== start) {
    const predecessor = previous.get(current);
    if (!predecessor) {
      return [];
    }
    path.unshift(predecessor);
    current = predecessor;
  }

  return path;
}

function findDirectCost(source: string, target: string, routeResources: RouteResourceEdge[]): number | undefined {
  return routeResources.find(
    (edge) =>
      (edge.fromRouteNode === source && edge.toRouteNode === target) ||
      (edge.fromRouteNode === target && edge.toRouteNode === source)
  )?.cost;
}

function splitRouteHint(routeHint: string | undefined): string[] {
  return (routeHint ?? "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readRouteField(record: RawRouteRecord, aliases: string[]): string | undefined {
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

function readPosition(record: RawRouteRecord, xAliases: string[], yAliases: string[]): Position | undefined {
  const xText = readRouteField(record, xAliases);
  const yText = readRouteField(record, yAliases);
  if (!xText || !yText) {
    return undefined;
  }

  const x = Number(xText);
  const y = Number(yText);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}
