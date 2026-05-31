import type {
  DisplayRules,
  DisplayTemplate,
  DisplayTemplateOverride,
  GraphNode,
  PositionedNode,
  Position,
  TemplateAnchor
} from "./types.js";

export interface ResolvedDisplayTemplate extends DisplayTemplate {
  templateId: string;
  label: string;
  anchors: TemplateAnchor[];
}

export const DEFAULT_DISPLAY_RULES: DisplayRules = {
  templates: {
    "plain-device": {
      id: "plain-device",
      label: "Plain device",
      width: 92,
      height: 42,
      shape: "round-rectangle",
      fill: "#eef4ff",
      stroke: "#4777c5",
      strokeWidth: 1.5,
      labelPosition: "center",
      anchors: [
        { id: "left", label: "Left", side: "left", offset: 0.5 },
        { id: "right", label: "Right", side: "right", offset: 0.5 }
      ]
    },
    "board-panel": {
      id: "board-panel",
      label: "Board panel",
      width: 150,
      height: 220,
      shape: "round-rectangle",
      fill: "#dfe8f6",
      stroke: "#0b74d1",
      strokeWidth: 2,
      titleFill: "#eaf2ff",
      titleColor: "#0f172a",
      titleHeight: 42,
      labelPosition: "title",
      anchors: [
        { id: "left-upper", label: "Left upper", side: "left", offset: 0.32 },
        { id: "left-lower", label: "Left lower", side: "left", offset: 0.68 },
        { id: "right-upper", label: "Right upper", side: "right", offset: 0.32 },
        { id: "right-lower", label: "Right lower", side: "right", offset: 0.68 }
      ]
    },
    "breakout-panel": {
      id: "breakout-panel",
      label: "Breakout panel",
      width: 150,
      height: 220,
      shape: "round-rectangle",
      fill: "#d1cfcf",
      stroke: "#4a4a4a",
      strokeWidth: 2,
      titleFill: "#dedcdc",
      titleColor: "#111827",
      titleHeight: 42,
      labelPosition: "title",
      anchors: [
        { id: "left-in", label: "Input", side: "left", offset: 0.32 },
        { id: "right-upper", label: "Upper output", side: "right", offset: 0.32 },
        { id: "right-lower", label: "Lower output", side: "right", offset: 0.68 }
      ]
    },
    "part-sensor": {
      id: "part-sensor",
      label: "Part sensor",
      width: 190,
      height: 96,
      shape: "round-rectangle",
      fill: "#ffffff",
      stroke: "#737373",
      strokeWidth: 2,
      titleColor: "#111827",
      labelPosition: "title",
      anchors: [
        { id: "left", label: "Left connector", side: "left", offset: 0.62 },
        { id: "right", label: "Right connector", side: "right", offset: 0.62 }
      ]
    },
    "connector-port": {
      id: "connector-port",
      label: "Connector port",
      width: 58,
      height: 22,
      shape: "rectangle",
      fill: "#ffffff",
      stroke: "#1f2937",
      strokeWidth: 1,
      labelPosition: "center",
      anchors: [{ id: "center", label: "Center", side: "center", offset: 0.5 }]
    },
    "route-node": {
      id: "route-node",
      label: "Route node",
      width: 62,
      height: 26,
      shape: "hexagon",
      fill: "#fff7e7",
      stroke: "#c98722",
      strokeWidth: 1,
      labelPosition: "center"
    }
  },
  kindTemplates: {
    device: "plain-device",
    board: "board-panel",
    port: "connector-port",
    "route-node": "route-node"
  },
  nodeTemplates: {},
  templateOverrides: {}
};

export function mergeDisplayRules(input: Partial<DisplayRules> = {}): DisplayRules {
  return {
    templates: {
      ...DEFAULT_DISPLAY_RULES.templates,
      ...input.templates
    },
    kindTemplates: {
      ...DEFAULT_DISPLAY_RULES.kindTemplates,
      ...input.kindTemplates
    },
    nodeTemplates: {
      ...DEFAULT_DISPLAY_RULES.nodeTemplates,
      ...input.nodeTemplates
    },
    templateOverrides: {
      ...DEFAULT_DISPLAY_RULES.templateOverrides,
      ...input.templateOverrides
    }
  };
}

export function resolveDisplayTemplate(node: GraphNode | PositionedNode, rules: DisplayRules = DEFAULT_DISPLAY_RULES): ResolvedDisplayTemplate {
  const templateId =
    rules.nodeTemplates?.[node.id] ??
    node.metadata?.templateId ??
    rules.kindTemplates?.[node.type] ??
    DEFAULT_DISPLAY_RULES.kindTemplates?.[node.type] ??
    "plain-device";
  const base = rules.templates[templateId] ?? DEFAULT_DISPLAY_RULES.templates[templateId] ?? DEFAULT_DISPLAY_RULES.templates["plain-device"];
  const override = rules.templateOverrides?.[node.id] ?? {};
  return applyTemplateOverride(base, override, templateId, override.label ?? node.displayName);
}

export function getTemplateAnchorPosition(template: DisplayTemplate, nodePosition: Position, anchor: TemplateAnchor): Position {
  if (typeof anchor.x === "number" && typeof anchor.y === "number") {
    return {
      x: Math.round(nodePosition.x - template.width / 2 + anchor.x),
      y: Math.round(nodePosition.y - template.height / 2 + anchor.y)
    };
  }
  const offset = Math.max(0, Math.min(1, anchor.offset));
  if (anchor.side === "left") {
    return { x: Math.round(nodePosition.x - template.width / 2), y: Math.round(nodePosition.y - template.height / 2 + template.height * offset) };
  }
  if (anchor.side === "right") {
    return { x: Math.round(nodePosition.x + template.width / 2), y: Math.round(nodePosition.y - template.height / 2 + template.height * offset) };
  }
  if (anchor.side === "top") {
    return { x: Math.round(nodePosition.x - template.width / 2 + template.width * offset), y: Math.round(nodePosition.y - template.height / 2) };
  }
  if (anchor.side === "bottom") {
    return { x: Math.round(nodePosition.x - template.width / 2 + template.width * offset), y: Math.round(nodePosition.y + template.height / 2) };
  }
  return { x: Math.round(nodePosition.x), y: Math.round(nodePosition.y) };
}

export function buildTemplateBackgroundDataUri(template: DisplayTemplate): string {
  const strokeWidth = template.strokeWidth ?? 1;
  const titleHeight = template.titleHeight ?? 0;
  const rect = template.shape === "hexagon"
    ? `<polygon points="${hexagonPoints(template.width / 2, template.height / 2, template.width, template.height)}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`
    : `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${template.width - strokeWidth}" height="${template.height - strokeWidth}" rx="${template.shape === "round-rectangle" ? 8 : 0}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`;
  const title = titleHeight > 0
    ? `<rect x="${strokeWidth}" y="${strokeWidth}" width="${template.width - strokeWidth * 2}" height="${titleHeight}" rx="${template.shape === "round-rectangle" ? 7 : 0}" fill="${template.titleFill ?? template.fill}" opacity="0.82"/>`
    : "";
  const anchors = (template.anchors ?? [])
    .filter((anchor) => anchor.side !== "center")
    .map((anchor) => {
      const point = getTemplateAnchorPosition(template, { x: template.width / 2, y: template.height / 2 }, anchor);
      return `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#ffffff" stroke="${template.stroke}" stroke-width="1"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}">${rect}${title}${anchors}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function applyTemplateOverride(base: DisplayTemplate, override: DisplayTemplateOverride, templateId: string, label: string): ResolvedDisplayTemplate {
  return {
    ...base,
    ...override,
    id: base.id,
    templateId,
    label,
    anchors: override.anchors ?? base.anchors ?? []
  };
}

function hexagonPoints(cx: number, cy: number, width: number, height: number): string {
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    [cx - halfW * 0.72, cy - halfH],
    [cx + halfW * 0.72, cy - halfH],
    [cx + halfW, cy],
    [cx + halfW * 0.72, cy + halfH],
    [cx - halfW * 0.72, cy + halfH],
    [cx - halfW, cy]
  ].map(([x, y]) => `${x},${y}`).join(" ");
}
