import type {
  CanonicalGraph,
  GraphNode,
  LayoutRules,
  LayoutWarning,
  PositionedGraph,
  PositionedNode,
  Position
} from "./types.js";

export const DEFAULT_LAYOUT_RULES: LayoutRules = {
  layerOrder: ["part", "breakout", "interface", "control", "switch", "ipc", "route"],
  dx: 240,
  dy: 28,
  cabinetGap: 900,
  slotGap: 120,
  boardGap: 24
};

interface PlacementInput {
  node: GraphNode;
  layer: string;
  cabinet: string;
  slot: string;
  device: string;
  board: string;
  order: number;
  cabinetRank: number;
  slotRank: number;
  boardRank: number;
  deviceRank: number;
}

export function createPresetLayout(graph: CanonicalGraph, rules: LayoutRules = DEFAULT_LAYOUT_RULES): PositionedGraph {
  const rankContext = buildRankContext(graph.nodes, rules);
  const placements = graph.nodes.map((node) => buildPlacementInput(node, rules, rankContext));
  const sortedPlacements = placements
    .slice()
    .sort((a, b) => comparePlacement(a, b, rules));
  const occupied = new Map<string, string>();
  const warnings: LayoutWarning[] = [];

  const nodes = placements.map<PositionedNode>((placement) => {
    const override = rules.overridePositions?.[placement.node.id];
    const basePosition = override ?? {
      x: layerToX(placement.layer, rules),
      y:
        placement.cabinetRank * rules.cabinetGap +
        placement.slotRank * rules.slotGap +
        placement.deviceRank * rules.dy +
        placement.boardRank * rules.boardGap +
        placement.order * rules.dy
    };
    const { position, warning } = reservePosition(placement.node.id, basePosition, occupied);
    if (warning) {
      warnings.push(warning);
    }

    return {
      ...placement.node,
      position,
      layout: {
        layer: placement.layer,
        cabinet: placement.cabinet,
        slot: placement.slot,
        device: placement.device,
        board: placement.board,
        order: placement.order,
        reason: override
          ? `override position applied for ${placement.node.id}`
          : `layer=${placement.layer}; cabinet=${placement.cabinet}; slot=${placement.slot}; device=${placement.device}; board=${placement.board}; order=${placement.order}`
      }
    };
  });

  return {
    nodes,
    edges: graph.edges,
    warnings,
    rules
  };
}

export function explainPosition(positionedGraph: PositionedGraph, nodeId: string): string {
  const node = positionedGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`No positioned node found for ${nodeId}`);
  }

  return `${node.id}: x=${node.position.x}, y=${node.position.y}; ${node.layout.reason}`;
}

function buildPlacementInput(node: GraphNode, rules: LayoutRules, rankContext: RankContext): PlacementInput {
  const layer = resolveLayer(node, rules);
  const cabinet = node.metadata?.cabinet ?? "";
  const slot = node.metadata?.slot ?? "";
  const device = resolveDeviceName(node);
  const board = resolveBoardName(node);
  const order = Number(node.metadata?.order ?? "0");

  return {
    node,
    layer,
    cabinet,
    slot,
    device,
    board,
    order: Number.isFinite(order) ? order : 0,
    cabinetRank: rankContext.cabinetRanks.get(cabinet) ?? 0,
    slotRank: rankContext.slotRanks.get(slot) ?? 0,
    deviceRank: orderedRank(device, rules.deviceOrder, rankContext.deviceRanks),
    boardRank: orderedRank(board, rules.boardOrder, rankContext.boardRanks)
  };
}

function comparePlacement(a: PlacementInput, b: PlacementInput, rules: LayoutRules): number {
  return (
    layerRank(a.layer, rules) - layerRank(b.layer, rules) ||
    a.cabinetRank - b.cabinetRank ||
    a.slotRank - b.slotRank ||
    a.deviceRank - b.deviceRank ||
    a.boardRank - b.boardRank ||
    a.order - b.order ||
    a.node.id.localeCompare(b.node.id)
  );
}

function resolveLayer(node: GraphNode, rules: LayoutRules): string {
  return rules.nodeLayers?.[node.id] ?? node.layer ?? node.metadata?.layer ?? "custom";
}

function layerToX(layer: string, rules: LayoutRules): number {
  return layerRank(layer, rules) * rules.dx;
}

function layerRank(layer: string, rules: LayoutRules): number {
  const index = rules.layerOrder.indexOf(layer);
  return index >= 0 ? index : rules.layerOrder.length;
}

function resolveDeviceName(node: GraphNode): string {
  if (node.type === "device") {
    return node.displayName;
  }
  return node.id.split(":")[1]?.split("/")[0] ?? node.displayName;
}

function resolveBoardName(node: GraphNode): string {
  if (node.type === "board") {
    return node.displayName;
  }
  return node.id.split(":")[1]?.split("/")[1] ?? "";
}

interface RankContext {
  cabinetRanks: Map<string, number>;
  slotRanks: Map<string, number>;
  deviceRanks: Map<string, number>;
  boardRanks: Map<string, number>;
}

function buildRankContext(nodes: GraphNode[], rules: LayoutRules): RankContext {
  const cabinets = new Set<string>([""]);
  const slots = new Set<string>([""]);
  const devices = new Set<string>();
  const boards = new Set<string>([""]);

  for (const node of nodes) {
    cabinets.add(node.metadata?.cabinet ?? "");
    slots.add(node.metadata?.slot ?? "");
    devices.add(resolveDeviceName(node));
    boards.add(resolveBoardName(node));
  }

  return {
    cabinetRanks: sortedRankMap(cabinets),
    slotRanks: sortedRankMap(slots),
    deviceRanks: sortedRankMap(devices, rules.deviceOrder),
    boardRanks: sortedRankMap(boards, rules.boardOrder)
  };
}

function sortedRankMap(values: Set<string>, explicitOrder: string[] = []): Map<string, number> {
  const orderedValues = [
    ...explicitOrder.filter((value) => value && values.has(value)),
    ...Array.from(values)
      .filter((value) => value && !explicitOrder.includes(value))
      .sort()
  ];

  const ranks = new Map(orderedValues.map((value, index) => [value, index]));
  ranks.set("", 0);
  return ranks;
}

function orderedRank(value: string, explicitOrder: string[] | undefined, fallbackRanks: Map<string, number>): number {
  if (!value) {
    return 0;
  }
  const explicitIndex = explicitOrder?.indexOf(value) ?? -1;
  if (explicitIndex >= 0) {
    return explicitIndex;
  }
  return fallbackRanks.get(value) ?? 0;
}

function reservePosition(
  nodeId: string,
  originalPosition: Position,
  occupied: Map<string, string>
): { position: Position; warning?: LayoutWarning } {
  let position = { ...originalPosition };
  let offset = 0;
  while (occupied.has(positionKey(position))) {
    offset += 1;
    position = {
      x: originalPosition.x + offset,
      y: originalPosition.y + offset
    };
  }

  occupied.set(positionKey(position), nodeId);
  if (offset === 0) {
    return { position };
  }

  return {
    position,
    warning: {
      code: "POSITION_COLLISION",
      nodeId,
      originalPosition,
      adjustedPosition: position,
      message: `Position collision at (${originalPosition.x}, ${originalPosition.y}); shifted ${nodeId} by ${offset}.`
    }
  };
}

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}
