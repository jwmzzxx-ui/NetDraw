import type {
  CanonicalGraph,
  DisplayRules,
  GraphNode,
  LayerId,
  LayoutRules,
  LayoutWarning,
  PositionedGraph,
  PositionedNode,
  Position,
  TemplatePort
} from "./types.js";
import { DEFAULT_DISPLAY_RULES, getTemplatePortPosition, resolveDisplayTemplate } from "./displayRules.js";
import { CANONICAL_LAYER_IDS, layerLabelFor, normalizeLayerId } from "./layers.js";

export const DEFAULT_LAYOUT_RULES: LayoutRules = {
  layerOrder: [...CANONICAL_LAYER_IDS, "route"],
  dx: 240,
  dy: 28,
  cabinetGap: 900,
  moduleGap: 700,
  slotGap: 120,
  boardGap: 24,
  projectionDefaults: { mode: "layer", minVisibleLayer: "L1" }
};

interface PlacementInput {
  node: GraphNode;
  layer: string;
  layerId: LayerId;
  layerName: string;
  module: string;
  cabinet: string;
  slot: string;
  component: string;
  pdmCode: string;
  componentCode: string;
  order: number;
  cabinetRank: number;
  moduleRank: number;
  slotRank: number;
  componentRank: number;
  boardRank: number;
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
        layerId: placement.layerId,
        layerName: placement.layerName,
        module: placement.module,
        cabinet: placement.cabinet,
        slot: placement.slot,
        device: placement.component,
        board: "",
        component: placement.component,
        pdmCode: placement.pdmCode,
        componentCode: placement.componentCode,
        order: placement.order,
        reason: override
          ? `override position applied for ${placement.node.id}`
          : `module=${placement.module}; layer=${placement.layerId}; cabinet=${placement.cabinet}; slot=${placement.slot}; component=${placement.pdmCode || placement.component}; order=${placement.order}`
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
  const layerId = resolveLayerId(node, rules);
  const layerName = node.metadata?.layerName ?? layerLabelFor(layerId);
  const module = node.metadata?.module ?? "";
  const cabinet = node.metadata?.cabinet ?? "";
  const slot = node.metadata?.slot ?? "";
  const component = resolveComponentName(node);
  const pdmCode = node.pdmCode ?? node.metadata?.pdmCode ?? node.componentCode ?? node.metadata?.componentCode ?? node.metadata?.componentId ?? component;
  const legacyDevice = resolveLegacyDeviceName(node);
  const legacyBoard = resolveLegacyBoardName(node);
  const order = Number(node.metadata?.order ?? "0");

  return {
    node,
    layer,
    layerId,
    layerName,
    module,
    cabinet,
    slot,
    component,
    pdmCode,
    componentCode: pdmCode,
    order: Number.isFinite(order) ? order : 0,
    moduleRank: orderedRank(module, rules.moduleOrder, rankContext.moduleRanks),
    cabinetRank: rankContext.cabinetRanks.get(cabinet) ?? 0,
    slotRank: rankContext.slotRanks.get(slot) ?? 0,
    componentRank: orderedRank(legacyDevice || pdmCode || component, rules.deviceOrder, rankContext.componentRanks),
    boardRank: orderedRank(legacyBoard, rules.boardOrder, rankContext.boardRanks)
  };
}

function comparePlacement(a: PlacementInput, b: PlacementInput, rules: LayoutRules): number {
  return (
    layerRank(a.layerId, rules) - layerRank(b.layerId, rules) ||
    a.moduleRank - b.moduleRank ||
    a.cabinetRank - b.cabinetRank ||
    a.slotRank - b.slotRank ||
    a.componentRank - b.componentRank ||
    a.order - b.order ||
    a.node.id.localeCompare(b.node.id)
  );
}

function basePositionFor(placement: PlacementInput, rules: LayoutRules): Position {
  return {
    x: layerToX(placement.layerId, rules),
    y:
      placement.moduleRank * (rules.moduleGap ?? DEFAULT_LAYOUT_RULES.moduleGap ?? 0) +
      placement.cabinetRank * rules.cabinetGap +
      placement.slotRank * rules.slotGap +
      placement.componentRank * rules.dy +
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
  const port = matchPort(placement.node, parentTemplate.ports ?? []);
  return port ? getTemplatePortPosition(parentTemplate, parentPosition, port) : undefined;
}

function matchPort(node: GraphNode, ports: TemplatePort[]): TemplatePort | undefined {
  const params = parseTemplateParams(node.metadata?.templateParams);
  const requested = params.portId ?? params.anchorId ?? params.anchor ?? node.metadata?.templateVariant;
  if (requested) {
    const direct = ports.find((port) => port.id === requested || port.label === requested || port.connectorName === requested);
    if (direct) {
      return direct;
    }
  }
  const haystack = `${node.id} ${node.displayName}`.toLowerCase();
  return ports.find((port) => haystack.includes(port.id.toLowerCase()) || (port.connectorName && haystack.includes(port.connectorName.toLowerCase())) || (port.label && haystack.includes(port.label.toLowerCase())));
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
  return resolveLayerId(node, rules);
}

function resolveLayerId(node: GraphNode, rules: LayoutRules): LayerId {
  return normalizeLayerId(rules.nodeLayers?.[node.id] ?? node.metadata?.layerId ?? node.layer ?? node.metadata?.layer);
}

function layerToX(layer: string, rules: LayoutRules): number {
  return layerRank(layer, rules) * rules.dx;
}

function layerRank(layer: string, rules: LayoutRules): number {
  const index = rules.layerOrder.indexOf(layer);
  if (index >= 0) {
    return index;
  }
  const normalizedLayer = normalizeLayerId(layer);
  const normalizedIndex = rules.layerOrder.map((entry) => entry === "route" ? "route" : normalizeLayerId(entry)).indexOf(normalizedLayer);
  return normalizedIndex >= 0 ? normalizedIndex : rules.layerOrder.length;
}

function resolveComponentName(node: GraphNode): string {
  return node.componentName ?? node.metadata?.componentName ?? node.displayName;
}

function resolveLegacyDeviceName(node: GraphNode): string {
  if (node.type === "device") {
    return node.displayName;
  }
  return node.id.split(":")[1]?.split("/")[0] ?? "";
}

function resolveLegacyBoardName(node: GraphNode): string {
  if (node.type === "board") {
    return node.displayName;
  }
  return node.id.split(":")[1]?.split("/")[1] ?? "";
}

interface RankContext {
  moduleRanks: Map<string, number>;
  cabinetRanks: Map<string, number>;
  slotRanks: Map<string, number>;
  componentRanks: Map<string, number>;
  boardRanks: Map<string, number>;
}

function buildRankContext(nodes: GraphNode[], rules: LayoutRules): RankContext {
  const modules = new Set<string>([""]);
  const cabinets = new Set<string>([""]);
  const slots = new Set<string>([""]);
  const components = new Set<string>();
  const boards = new Set<string>([""]);

  for (const node of nodes) {
    modules.add(node.metadata?.module ?? "");
    cabinets.add(node.metadata?.cabinet ?? "");
    slots.add(node.metadata?.slot ?? "");
    components.add(node.pdmCode ?? node.metadata?.pdmCode ?? node.componentCode ?? node.metadata?.componentCode ?? resolveComponentName(node));
    const legacyDevice = resolveLegacyDeviceName(node);
    if (legacyDevice) {
      components.add(legacyDevice);
    }
    boards.add(resolveLegacyBoardName(node));
  }

  return {
    moduleRanks: sortedRankMap(modules, rules.moduleOrder),
    cabinetRanks: sortedRankMap(cabinets),
    slotRanks: sortedRankMap(slots),
    componentRanks: sortedRankMap(components, rules.deviceOrder),
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
