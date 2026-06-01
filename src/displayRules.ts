import type {
  CableTemplate,
  DisplayRules,
  DisplayTemplate,
  DisplayTemplateOverride,
  GraphEdge,
  GraphNode,
  PositionedNode,
  Position,
  TemplatePort,
  TemplatePortLabel,
  TemplateTextBox
} from "./types.js";
import { toSlug } from "./normalizer.js";

export interface ResolvedDisplayTemplate extends DisplayTemplate {
  templateId: string;
  label: string;
  ports: TemplatePort[];
  anchors: TemplatePort[];
  textBoxes: TemplateTextBox[];
}

export interface ResolvedCableTemplate extends CableTemplate {
  templateId: string;
  textBoxes: TemplateTextBox[];
}

export interface CableTemplateContext extends GraphEdge {
  sourcePortName: string;
  targetPortName: string;
  sourceConnectorName: string;
  targetConnectorName: string;
}

export const DEFAULT_DISPLAY_RULES: DisplayRules = {
  templates: {
    "component-card": {
      id: "component-card",
      label: "",
      width: 190,
      height: 96,
      shape: "round-rectangle",
      fill: "#ffffff",
      stroke: "#737373",
      strokeWidth: 2,
      titleColor: "#111827",
      labelPosition: "center",
      textBoxes: [
        { id: "component-name", x: 18, y: 12, width: 154, height: 20, bind: "componentName", fallback: "", fontSize: 16, color: "#000000", align: "center" },
        { id: "component-code", x: 18, y: 40, width: 154, height: 20, bind: "pdmCode", fallback: "", fontSize: 14, color: "#111827", align: "center" }
      ],
      ports: []
    },
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
      ports: [
        { id: "left", connectorName: "Left", side: "left", offset: 0.5 },
        { id: "right", connectorName: "Right", side: "right", offset: 0.5 }
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
      ports: [
        { id: "left-upper", connectorName: "Left upper", side: "left", offset: 0.32 },
        { id: "left-lower", connectorName: "Left lower", side: "left", offset: 0.68 },
        { id: "right-upper", connectorName: "Right upper", side: "right", offset: 0.32 },
        { id: "right-lower", connectorName: "Right lower", side: "right", offset: 0.68 }
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
      ports: [
        { id: "left-in", connectorName: "Input", side: "left", offset: 0.32 },
        { id: "right-upper", connectorName: "Upper output", side: "right", offset: 0.32 },
        { id: "right-lower", connectorName: "Lower output", side: "right", offset: 0.68 }
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
      ports: [
        { id: "left", connectorName: "Left connector", side: "left", offset: 0.62 },
        { id: "right", connectorName: "Right connector", side: "right", offset: 0.62 }
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
      ports: [{ id: "center", connectorName: "Center", side: "center", offset: 0.5 }]
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
  cableTemplates: {
    "default-cable": {
      id: "default-cable",
      label: "Default cable",
      stroke: "#2563eb",
      strokeWidth: 2,
      lineStyle: "solid",
      endpointLabels: {
        sourcePort: { id: "source-connector", x: -80, y: -18, width: 58, height: 18, bind: "sourceConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" },
        targetPort: { id: "target-connector", x: 80, y: -18, width: 58, height: 18, bind: "targetConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" }
      },
      cableLabel: { id: "cable-id", x: 0, y: -34, width: 110, height: 16, bind: "cableId", fallback: "", fontSize: 10, color: "#111827", align: "center" },
      textBoxes: [
        { id: "cable-id", x: 0, y: -14, width: 90, height: 16, bind: "cableId", fallback: "", fontSize: 10, color: "#334155", align: "center" }
      ]
    },
    "connector-cable": {
      id: "connector-cable",
      label: "Connector cable",
      stroke: "#2563eb",
      strokeWidth: 2,
      lineStyle: "solid",
      endpointLabels: {
        sourcePort: { id: "source-connector", x: -80, y: -18, width: 58, height: 18, bind: "sourceConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" },
        targetPort: { id: "target-connector", x: 80, y: -18, width: 58, height: 18, bind: "targetConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" }
      },
      cableLabel: { id: "cable-id", x: 0, y: -34, width: 110, height: 16, bind: "cableId", fallback: "", fontSize: 10, color: "#111827", align: "center" },
      textBoxes: []
    }
  },
  kindTemplates: {
    component: "component-card",
    device: "plain-device",
    board: "board-panel",
    port: "connector-port",
    "route-node": "route-node"
  },
  cableKindTemplates: {
    "logical-cable": "connector-cable"
  },
  nodeTemplates: {},
  templateOverrides: {}
};

export function mergeDisplayRules(input: Partial<DisplayRules> = {}): DisplayRules {
  return {
    templates: normalizeTemplateMap({
      ...DEFAULT_DISPLAY_RULES.templates,
      ...input.templates
    }),
    cableTemplates: {
      ...DEFAULT_DISPLAY_RULES.cableTemplates,
      ...input.cableTemplates
    },
    kindTemplates: {
      ...DEFAULT_DISPLAY_RULES.kindTemplates,
      ...input.kindTemplates
    },
    cableKindTemplates: {
      ...DEFAULT_DISPLAY_RULES.cableKindTemplates,
      ...input.cableKindTemplates
    },
    nodeTemplates: {
      ...DEFAULT_DISPLAY_RULES.nodeTemplates,
      ...input.nodeTemplates
    },
    pdmCodeTemplates: {
      ...DEFAULT_DISPLAY_RULES.pdmCodeTemplates,
      ...input.pdmCodeTemplates
    },
    edgeTemplates: {
      ...DEFAULT_DISPLAY_RULES.edgeTemplates,
      ...input.edgeTemplates
    },
    templateOverrides: {
      ...DEFAULT_DISPLAY_RULES.templateOverrides,
      ...input.templateOverrides
    }
  };
}

export function resolveDisplayTemplate(node: GraphNode | PositionedNode, rules: DisplayRules = DEFAULT_DISPLAY_RULES): ResolvedDisplayTemplate {
  const legacyIds = legacyTemplateIds(node);
  const pdmCode = readNodePdmCode(node);
  const pdmTemplateId = pdmCode
    ? rules.pdmCodeTemplates?.[pdmCode] ?? (rules.templates[`pdm-code:${toSlug(pdmCode)}`] ? `pdm-code:${toSlug(pdmCode)}` : undefined)
    : undefined;
  const templateId =
    pdmTemplateId ??
    node.metadata?.templateId ??
    rules.nodeTemplates?.[node.id] ??
    legacyIds.map((id) => rules.nodeTemplates?.[id]).find(Boolean) ??
    rules.kindTemplates?.[node.type] ??
    DEFAULT_DISPLAY_RULES.kindTemplates?.[node.type] ??
    "component-card";
  const base = normalizeTemplate(rules.templates[templateId] ?? DEFAULT_DISPLAY_RULES.templates[templateId] ?? DEFAULT_DISPLAY_RULES.templates["plain-device"]);
  const override = rules.templateOverrides?.[node.id] ?? legacyIds.map((id) => rules.templateOverrides?.[id]).find(Boolean) ?? {};
  return bindComponentTemplate(node, applyTemplateOverride(base, override, templateId, override.label ?? base.label));
}

function legacyTemplateIds(node: GraphNode | PositionedNode): string[] {
  const componentId = node.componentId ?? node.metadata?.componentId ?? "";
  const [device, board] = componentId.split("/");
  return [
    device ? `device:${device}` : "",
    device && board ? `board:${device}/${board}` : ""
  ].filter(Boolean);
}

export function resolveCableTemplate(edge: GraphEdge, rules: DisplayRules = DEFAULT_DISPLAY_RULES): ResolvedCableTemplate {
  const templateId = edge.type === "logical-cable"
    ? rules.edgeTemplates?.[edge.id] ?? rules.cableKindTemplates?.["logical-cable"] ?? DEFAULT_DISPLAY_RULES.cableKindTemplates?.["logical-cable"] ?? "connector-cable"
    : "";
  const base = rules.cableTemplates?.[templateId] ?? DEFAULT_DISPLAY_RULES.cableTemplates?.[templateId] ?? DEFAULT_DISPLAY_RULES.cableTemplates?.["default-cable"];
  const normalized = normalizeCableTemplate(base!);
  return {
    ...normalized,
    templateId: normalized.id,
    textBoxes: normalized.textBoxes ?? []
  };
}

export function getTemplatePortPosition(template: DisplayTemplate, nodePosition: Position, port: TemplatePort): Position {
  if (typeof port.x === "number" && typeof port.y === "number") {
    return {
      x: Math.round(nodePosition.x - template.width / 2 + port.x),
      y: Math.round(nodePosition.y - template.height / 2 + port.y)
    };
  }
  const offset = Math.max(0, Math.min(1, port.offset));
  if (port.side === "left") {
    return { x: Math.round(nodePosition.x - template.width / 2), y: Math.round(nodePosition.y - template.height / 2 + template.height * offset) };
  }
  if (port.side === "right") {
    return { x: Math.round(nodePosition.x + template.width / 2), y: Math.round(nodePosition.y - template.height / 2 + template.height * offset) };
  }
  if (port.side === "top") {
    return { x: Math.round(nodePosition.x - template.width / 2 + template.width * offset), y: Math.round(nodePosition.y - template.height / 2) };
  }
  if (port.side === "bottom") {
    return { x: Math.round(nodePosition.x - template.width / 2 + template.width * offset), y: Math.round(nodePosition.y + template.height / 2) };
  }
  return { x: Math.round(nodePosition.x), y: Math.round(nodePosition.y) };
}

export const getTemplateAnchorPosition = getTemplatePortPosition;

export interface TemplateBackgroundOptions {
  textBoxPlaceholder?: "bind" | "fallback";
}

export function buildTemplateBackgroundDataUri(template: DisplayTemplate, context?: GraphNode | PositionedNode, options: TemplateBackgroundOptions = {}): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildTemplateSvg(template, context, options))}`;
}

export function buildTemplateSvg(template: DisplayTemplate, context?: GraphNode | PositionedNode, options: TemplateBackgroundOptions = {}): string {
  const normalized = normalizeTemplate(template);
  const strokeWidth = template.strokeWidth ?? 1;
  const titleHeight = template.titleHeight ?? 0;
  const shape = renderTemplateShape(template, strokeWidth);
  const title = titleHeight > 0
    ? `<rect x="${strokeWidth}" y="${strokeWidth}" width="${template.width - strokeWidth * 2}" height="${titleHeight}" rx="${template.shape === "round-rectangle" ? 7 : 0}" fill="${template.titleFill ?? template.fill}" opacity="0.82"/>`
    : "";
  const label = renderTemplateLabelSvg(template, titleHeight);
  const ports = (normalized.ports ?? [])
    .filter((port) => port.side !== "center")
    .map((port) => {
      const point = getTemplatePortPosition(template, { x: template.width / 2, y: template.height / 2 }, port);
      return renderTemplatePortSvg(port, point, template.stroke);
    })
    .join("");
  const textBoxes = (normalized.textBoxes ?? [])
    .map((box) => renderTextBoxSvg(box, resolveTemplateTextBoxValue(box, context, options)))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}">${shape}${title}${label}${ports}${textBoxes}</svg>`;
}

export function resolveFieldPath(source: unknown, path?: string): string {
  if (!source || !path) {
    return "";
  }
  const value = path.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
  return value === undefined || value === null ? "" : String(value);
}

export function renderTemplateTextBox(box: TemplateTextBox, source: unknown): string {
  const value = resolveFieldPath(source, box.bind);
  return value || box.fallback || "";
}

function normalizeTemplateMap(templates: Record<string, DisplayTemplate>): Record<string, DisplayTemplate> {
  return Object.fromEntries(Object.entries(templates).map(([id, template]) => [id, normalizeTemplate(template)]));
}

function normalizeTemplate(template: DisplayTemplate): DisplayTemplate {
  const { anchors, ...rest } = template;
  const ports = (template.ports ?? anchors ?? []).map(normalizePort);
  return {
    ...rest,
    ports,
    textBoxes: template.textBoxes ?? []
  };
}

function normalizeCableTemplate(template: CableTemplate): CableTemplate {
  return {
    ...template,
    endpointLabels: template.endpointLabels ?? {
      sourcePort: { id: "source-connector", x: -80, y: -18, width: 58, height: 18, bind: "sourceConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" },
      targetPort: { id: "target-connector", x: 80, y: -18, width: 58, height: 18, bind: "targetConnectorName", fallback: "", fontSize: 10, color: "#111827", align: "center" }
    },
    cableLabel: template.cableLabel ?? { id: "cable-id", x: 0, y: -34, width: 110, height: 16, bind: "cableId", fallback: "", fontSize: 10, color: "#111827", align: "center" },
    textBoxes: template.textBoxes ?? []
  };
}

function normalizePort(port: TemplatePort): TemplatePort {
  const connectorName = port.connectorName ?? port.label ?? port.id;
  return {
    ...port,
    connectorName,
    idLabel: port.idLabel ?? defaultPortLabel("id", port.side),
    connectorLabel: port.connectorLabel ?? defaultPortLabel("connector", port.side)
  };
}

function bindComponentTemplate(node: GraphNode | PositionedNode, template: ResolvedDisplayTemplate): ResolvedDisplayTemplate {
  if (node.type !== "component") {
    return template;
  }
  const componentName = template.label || node.componentName || node.metadata?.componentName || node.displayName;
  const pdmCode = readNodePdmCode(node) ?? node.componentId ?? node.metadata?.componentId ?? node.id;
  const nodePorts = node.ports ?? [];
  const shouldUseNodePorts = nodePorts.length > 0 && (template.ports.length === 0 || nodePorts.some((port) => port.metadata?.source !== "interface"));
  const ports = shouldUseNodePorts ? nodePorts.map((port, index) => componentPortToTemplatePort(port, index, nodePorts.length)) : template.ports;
  return {
    ...template,
    ports: ports.map(normalizePort),
    anchors: ports.map(normalizePort),
    textBoxes: template.textBoxes?.length
      ? template.textBoxes
      : [
          { id: "component-name", x: 18, y: 12, width: template.width - 36, height: 20, bind: "componentName", fallback: componentName, fontSize: 16, color: "#000000", align: "center" },
          { id: "component-code", x: 18, y: 40, width: template.width - 36, height: 20, bind: "pdmCode", fallback: pdmCode, fontSize: 14, color: "#111827", align: "center" }
        ]
  };
}

export function buildCableTemplateContext(edge: GraphEdge, source?: GraphNode | PositionedNode, target?: GraphNode | PositionedNode): CableTemplateContext {
  const sourcePort = source?.ports?.find((port) => port.portId === edge.sourcePortId);
  const targetPort = target?.ports?.find((port) => port.portId === edge.targetPortId);
  const sourcePortName = sourcePort?.displayName ?? sourcePort?.portId ?? edge.sourcePortId ?? edge.sourceRow.srcPort;
  const targetPortName = targetPort?.displayName ?? targetPort?.portId ?? edge.targetPortId ?? edge.sourceRow.dstPort;
  return {
    ...edge,
    sourcePortName,
    targetPortName,
    sourceConnectorName: sourcePort?.connectorName ?? sourcePortName,
    targetConnectorName: targetPort?.connectorName ?? targetPortName
  };
}

function readNodePdmCode(node: GraphNode | PositionedNode): string | undefined {
  return node.pdmCode ?? node.metadata?.pdmCode ?? node.componentCode ?? node.metadata?.componentCode;
}

function componentPortToTemplatePort(
  port: NonNullable<GraphNode["ports"]>[number],
  index: number,
  total: number
): TemplatePort {
  const side = port.side ?? (index % 2 === 0 ? "left" : "right");
  const sideIndex = Math.floor(index / 2);
  const sideTotal = Math.max(1, Math.ceil(total / 2));
  const offset = port.offset ?? ((sideIndex + 1) / (sideTotal + 1));
  return {
    id: port.portId,
    connectorName: port.connectorName ?? port.displayName ?? port.portId,
    label: port.displayName ?? port.portId,
    side,
    offset,
    x: port.x,
    y: port.y,
    boxWidth: 52,
    boxHeight: 18,
    connectorLabel: {
      x: side === "left" ? -26 : 26,
      y: 4,
      fontSize: 8,
      color: "#111827",
      align: "center",
      snapSide: side
    },
    idLabel: {
      x: side === "left" ? 40 : -40,
      y: 4,
      fontSize: 8,
      color: "#111827",
      align: side === "left" ? "left" : "right",
      snapSide: side
    }
  };
}

function defaultPortLabel(kind: "id" | "connector", side: TemplatePort["side"]): TemplatePortLabel {
  const sideSign = side === "left" ? -1 : side === "right" ? 1 : 0;
  const verticalSign = side === "top" ? -1 : side === "bottom" ? 1 : 0;
  return {
    x: sideSign * (kind === "id" ? 14 : 34),
    y: verticalSign * (kind === "id" ? 14 : 28) + (kind === "id" ? -6 : 8),
    fontSize: kind === "id" ? 7 : 8,
    color: "#172033",
    align: "center",
    snapSide: side
  };
}

function applyTemplateOverride(base: DisplayTemplate, override: DisplayTemplateOverride, templateId: string, label: string): ResolvedDisplayTemplate {
  const normalizedBase = normalizeTemplate(base);
  const ports = override.ports ?? override.anchors ?? normalizedBase.ports ?? [];
  const normalizedPorts = ports.map(normalizePort);
  return {
    ...normalizedBase,
    ...override,
    id: normalizedBase.id,
    templateId,
    label,
    ports: normalizedPorts,
    anchors: normalizedPorts,
    textBoxes: override.textBoxes ?? normalizedBase.textBoxes ?? []
  };
}

function renderPortLabelSvg(label: TemplatePortLabel | undefined, text: string, point: Position): string {
  if (!label || !text) {
    return "";
  }
  const x = point.x + label.x;
  const y = point.y + label.y;
  const anchor = label.align === "left" ? "start" : label.align === "right" ? "end" : "middle";
  return `<text x="${x}" y="${y}" font-family="Inter, Segoe UI, sans-serif" font-size="${label.fontSize}" text-anchor="${anchor}" fill="${label.color ?? "#172033"}">${escapeXml(text)}</text>`;
}

function renderTemplatePortSvg(port: TemplatePort, point: Position, stroke: string): string {
  if (port.boxWidth && port.boxHeight) {
    const x = point.x - port.boxWidth / 2;
    const y = point.y - port.boxHeight / 2;
    return [
      `<g>`,
      `<rect x="${x}" y="${y}" width="${port.boxWidth}" height="${port.boxHeight}" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`,
      renderPortLabelSvg(port.connectorLabel, port.connectorName ?? port.label ?? port.id, point),
      renderPortLabelSvg(port.idLabel, port.id, point),
      `</g>`
    ].join("");
  }
  return [
    `<g>`,
    `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`,
    renderPortLabelSvg(port.idLabel, port.id, point),
    renderPortLabelSvg(port.connectorLabel, port.connectorName ?? port.label ?? port.id, point),
    `</g>`
  ].join("");
}

function renderTemplateShape(template: DisplayTemplate, strokeWidth: number): string {
  if (template.shape === "hexagon") {
    return `<polygon points="${hexagonPoints(template.width / 2, template.height / 2, template.width, template.height)}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`;
  }
  if (template.shape === "ellipse") {
    return `<ellipse cx="${template.width / 2}" cy="${template.height / 2}" rx="${(template.width - strokeWidth) / 2}" ry="${(template.height - strokeWidth) / 2}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`;
  }
  return `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${template.width - strokeWidth}" height="${template.height - strokeWidth}" rx="${template.shape === "round-rectangle" ? 8 : 0}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`;
}

function renderTemplateLabelSvg(template: DisplayTemplate, titleHeight: number): string {
  if (!template.label) {
    return "";
  }
  const fontSize = 12;
  const y = template.labelPosition === "title" && titleHeight > 0
    ? Math.max(18, titleHeight / 2 + 4)
    : template.height / 2 + fontSize / 3;
  const weight = template.labelPosition === "title" ? 700 : 600;
  return `<text x="${template.width / 2}" y="${y}" font-family="Inter, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="middle" fill="${template.titleColor ?? "#233042"}">${escapeXml(template.label)}</text>`;
}

function resolveTemplateTextBoxValue(box: TemplateTextBox, context: unknown, options: TemplateBackgroundOptions): string {
  const value = resolveFieldPath(context, box.bind);
  if (value) {
    return value;
  }
  if (options.textBoxPlaceholder === "bind") {
    return box.bind || box.fallback || box.id;
  }
  return box.fallback || "";
}

function renderTextBoxSvg(box: TemplateTextBox, value: string): string {
  const text = value || box.fallback || "";
  if (!text) {
    return "";
  }
  const x = box.x + (box.align === "center" ? box.width / 2 : box.align === "right" ? box.width : 0);
  const anchor = box.align === "center" ? "middle" : box.align === "right" ? "end" : "start";
  const y = box.y + Math.max(10, (box.fontSize ?? 10));
  return `<text x="${x}" y="${y}" font-family="Inter, Segoe UI, sans-serif" font-size="${box.fontSize ?? 10}" text-anchor="${anchor}" fill="${box.color ?? "#172033"}">${escapeXml(text)}</text>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
