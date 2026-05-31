import type {
  CanonicalGraph,
  DisplayRules,
  GraphNode,
  LayoutRules,
  LayoutWarning,
  PositionedGraph,
  PositionedNode,
  Position,
  TemplateAnchor
} from "./types.js";
import { DEFAULT_DISPLAY_RULES, getTemplateAnchorPosition, resolveDisplayTemplate } from "./displayRules.js";

export const DEFAULT_LAYOUT_RULES: LayoutRules = {
  layerOrder: ["part", "breakout", "interface", "control", "switch", "ipc", "route"],
  dx: 240,
  dy: 28,
  cabinetGap: 900,
  moduleGap: 700,
  slotGap: 120,
  boardGap: 24,
  projectionDefaults: { mode: "layer", minVisibleLayer: "breakout" }
};

interface PlacementInput {
  node: GraphNode;
  layer: string;
  module: string;
  cabinet: string;
  slot: string;
  device: string;
  board: string;
  order: number;
  cabinetRank: number;
  moduleRank: number;
  slotRank: number;
  boardRank: number;
  deviceRank: number;
}

export function createPresetLayout(
  graph: CanonicalGraph,
  rules: LayoutRules = DEFAULT_LAYOUT_RULES,
  displayRules: DisplayRules = DEFAULT_DISPLAY_RULES
): PositionedGraph {
  const rankContext = buildRankContext(graph.nodes, rules);
  const placements = graph.nodes.map((node) => buildPlacementInput(node, rules, rankContext));
  const sortedPlacements = placements
    .slice()
    .sort((a, b) => comparePlacement(a, b, rules));
  const placementById = new Map(placements.map((placement) => [placement.node.id, placement]));
  const basePositions = new Map(placements.map((placement) => [placement.node.id, basePositionFor(placement, rules)]));
  const occupied = new Map<string, string>();
  const warnings: LayoutWarning[] = [];

  const nodes = placements.map<PositionedNode>((placement) => {
    const override = rules.overridePositions?.[placement.node.id];
    const basePosition = override ?? anchoredPortPosition(placement, placementById, basePositions, displayRules) ?? basePositions.get(placement.node.id)!;
    const { position, warning } = reservePosition(placement.node.id, basePosition, occupied);
    if (warning) {
      warnings.push(warning);
    }

    return {
      ...placement.node,
      position,
      layout: {
        layer: placement.layer,
        module: placement.module,
        cabinet: placement.cabinet,
        slot: placement.slot,
        device: placement.device,
        board: placement.board,
        order: placement.order,
        reason: override
          ? `override position applied for ${placement.node.id}`
          : `module=${placement.module}; layer=${placement.layer}; cabinet=${placement.cabinet}; slot=${placement.slot}; device=${placement.device}; board=${placement.board}; order=${placement.order}`
      }
    };
  });

  return {
    nodes,
    edges: graph.edges,
    warnings,
    rules,
    displayRules
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
  const module = node.metadata?.module ?? "";
  const cabinet = node.metadata?.cabinet ?? "";
  const slot = node.metadata?.slot ?? "";
  const device = resolveDeviceName(node);
  const board = resolveBoardName(node);
  const order = Number(node.metadata?.order ?? "0");

  return {
    node,
    layer,
    module,
    cabinet,
    slot,
    device,
    board,
    order: Number.isFinite(order) ? order : 0,
    moduleRank: orderedRank(module, rules.moduleOrder, rankContext.moduleRanks),
    cabinetRank: rankContext.cabinetRanks.get(cabinet) ?? 0,
    slotRank: rankContext.slotRanks.get(slot) ?? 0,
    deviceRank: orderedRank(device, rules.deviceOrder, rankContext.deviceRanks),
    boardRank: orderedRank(board, rules.boardOrder, rankContext.boardRanks)
  };
}

function comparePlacement(a: PlacementInput, b: PlacementInput, rules: LayoutRules): number {
  return (
    layerRank(a.layer, rules) - layerRank(b.layer, rules) ||
    a.moduleRank - b.moduleRank ||
    a.cabinetRank - b.cabinetRank ||
    a.slotRank - b.slotRank ||
    a.deviceRank - b.deviceRank ||
    a.boardRank - b.boardRank ||
    a.order - b.order ||
    a.node.id.localeCompare(b.node.id)
  );
}

function basePositionFor(placement: PlacementInput, rules: LayoutRules): Position {
  return {
    x: layerToX(placement.layer, rules),
    y:
      placement.moduleRank * (rules.moduleGap ?? DEFAULT_LAYOUT_RULES.moduleGap ?? 0) +
      placement.cabinetRank * rules.cabinetGap +
      placement.slotRank * rules.slotGap +
      placement.deviceRank * rules.dy +
      placement.boardRank * rules.boardGap +
      placement.order * rules.dy
  };
}

function anchoredPortPosition(
  placement: PlacementInput,
  placementById: Map<string, PlacementInput>,
  basePositions: Map<string, Position>,
  displayRules: DisplayRules
): Position | undefined {
  if (placement.node.type !== "port" || !placement.node.parent) {
    return undefined;
  }
  const parentPlacement = placementById.get(placement.node.parent);
  const parentPosition = basePositions.get(placement.node.parent);
  if (!parentPlacement || !parentPosition) {
    return undefined;
  }
  const parentTemplate = resolveDisplayTemplate(parentPlacement.node, displayRules);
  const anchor = matchAnchor(placement.node, parentTemplate.anchors ?? []);
  return anchor ? getTemplateAnchorPosition(parentTemplate, parentPosition, anchor) : undefined;
}

function matchAnchor(node: GraphNode, anchors: TemplateAnchor[]): TemplateAnchor | undefined {
  const params = parseTemplateParams(node.metadata?.templateParams);
  const requested = params.anchorId ?? params.anchor ?? node.metadata?.templateVariant;
  if (requested) {
    const direct = anchors.find((anchor) => anchor.id === requested || anchor.label === requested);
    if (direct) {
      return direct;
    }
  }
  const haystack = `${node.id} ${node.displayName}`.toLowerCase();
  return anchors.find((anchor) => haystack.includes(anchor.id.toLowerCase()) || (anchor.label && haystack.includes(anchor.label.toLowerCase())));
}

function parseTemplateParams(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([key, entry]) => [key, String(entry)]));
  } catch {
    return {};
  }
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
  moduleRanks: Map<string, number>;
  cabinetRanks: Map<string, number>;
  slotRanks: Map<string, number>;
  deviceRanks: Map<string, number>;
  boardRanks: Map<string, number>;
}

function buildRankContext(nodes: GraphNode[], rules: LayoutRules): RankContext {
  const modules = new Set<string>([""]);
  const cabinets = new Set<string>([""]);
  const slots = new Set<string>([""]);
  const devices = new Set<string>();
  const boards = new Set<string>([""]);

  for (const node of nodes) {
    modules.add(node.metadata?.module ?? "");
    cabinets.add(node.metadata?.cabinet ?? "");
    slots.add(node.metadata?.slot ?? "");
    devices.add(resolveDeviceName(node));
    boards.add(resolveBoardName(node));
  }

  return {
    moduleRanks: sortedRankMap(modules, rules.moduleOrder),
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
