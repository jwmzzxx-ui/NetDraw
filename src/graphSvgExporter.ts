import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildCableTemplateContext, DEFAULT_DISPLAY_RULES, getTemplatePortPosition, renderTemplateTextBox, resolveCableTemplate, resolveDisplayTemplate, type CableTemplateContext } from "./displayRules.js";
import { buildLegendItems, DEFAULT_STYLE_RULES, type StyleRules } from "./styleRules.js";
import type { CableTemplate, GraphEdge, PositionedGraph, PositionedNode, Position, TemplatePort, TemplatePortLabel, TemplateTextBox } from "./types.js";

export interface GraphSvgOptions {
  title?: string;
  width?: number;
  height?: number;
  rules?: StyleRules;
}

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function renderGraphSvg(graph: PositionedGraph, options: GraphSvgOptions = {}): string {
  const rules = options.rules ?? DEFAULT_STYLE_RULES;
  const width = options.width ?? 1800;
  const height = options.height ?? 1100;
  const title = options.title ?? "NetDraw Graph";
  const viewBox = calculateViewBox(graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeSvg = graph.edges.map((edge) => renderEdge(edge, nodeById, rules, graph.rules.edgeBendPoints?.[edge.id] ?? [], graph)).join("\n");
  const nodeSvg = graph.nodes.map((node) => renderNode(node, rules, graph)).join("\n");
  const legendSvg = renderLegend(viewBox, rules);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" role="img">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" fill="#f8fafc"/>`,
    `<text x="${viewBox.minX + 24}" y="${viewBox.minY + 34}" font-family="Inter, Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#172033">${escapeXml(title)}</text>`,
    `<g id="edges">`,
    edgeSvg,
    `</g>`,
    `<g id="nodes">`,
    nodeSvg,
    `</g>`,
    legendSvg,
    `</svg>`
  ].join("\n");
}

export async function writeGraphSvg(graph: PositionedGraph, filePath: string, options: GraphSvgOptions = {}): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, renderGraphSvg(graph, options), "utf8");
}

function renderEdge(edge: GraphEdge, nodeById: Map<string, PositionedNode>, rules: StyleRules, bendPoints: Array<{ x: number; y: number }>, graph: PositionedGraph): string {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) {
    return "";
  }
  const cableTemplate = edge.type === "logical-cable" ? resolveCableTemplate(edge, graph.displayRules ?? DEFAULT_DISPLAY_RULES) : null;
  const style = edge.type === "route-segment" ? rules.routeSegment : rules.netTypes[edge.netType as keyof typeof rules.netTypes];
  const color = cableTemplate?.stroke ?? style?.color ?? "#7b8794";
  const width = cableTemplate?.strokeWidth ?? style?.width ?? 2;
  const lineStyle = cableTemplate?.lineStyle ?? style?.lineStyle;
  const dash = lineStyle === "dashed" ? ` stroke-dasharray="8 6"` : "";
  const pathPoints = [source.position, ...bendPoints, target.position];
  const labelPoint = bendPoints[0] ?? {
    x: (source.position.x + target.position.x) / 2,
    y: (source.position.y + target.position.y) / 2 - 8
  };
  const path =
    bendPoints.length > 0
      ? `<polyline points="${pathPoints.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`
      : `<line x1="${source.position.x}" y1="${source.position.y}" x2="${target.position.x}" y2="${target.position.y}" stroke="${color}" stroke-width="${width}"${dash} stroke-linecap="round"/>`;

  return [
    `<g id="edge-${escapeXml(edge.id)}">`,
    path,
    edge.type === "logical-cable" ? renderCableTextBoxes(buildCableTemplateContext(edge, source, target), cableTemplate, labelPoint, source.position, target.position, rules) : "",
    `</g>`
  ].filter(Boolean).join("\n");
}

function renderNode(node: PositionedNode, rules: StyleRules, graph: PositionedGraph): string {
  const template = resolveDisplayTemplate(node, graph.displayRules ?? DEFAULT_DISPLAY_RULES);
  const x = node.position.x - template.width / 2;
  const y = node.position.y - template.height / 2;
  const strokeWidth = template.strokeWidth ?? 1;
  const shape =
    template.shape === "hexagon"
      ? `<polygon points="${hexagonPoints(node.position.x, node.position.y, template.width, template.height)}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`
      : template.shape === "ellipse"
        ? `<ellipse cx="${node.position.x}" cy="${node.position.y}" rx="${template.width / 2}" ry="${template.height / 2}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`
        : `<rect x="${x}" y="${y}" width="${template.width}" height="${template.height}" rx="${template.shape === "round-rectangle" ? 8 : 0}" fill="${template.fill}" stroke="${template.stroke}" stroke-width="${strokeWidth}"/>`;
  const titleHeight = template.titleHeight ?? 0;
  const title = titleHeight > 0
    ? `<rect x="${x + strokeWidth}" y="${y + strokeWidth}" width="${template.width - strokeWidth * 2}" height="${titleHeight}" rx="${template.shape === "round-rectangle" ? 7 : 0}" fill="${template.titleFill ?? template.fill}" opacity="0.82"/>`
    : "";
  const labelY = template.labelPosition === "below"
    ? y + template.height + 15
    : template.labelPosition === "title" && titleHeight > 0
      ? y + Math.max(18, titleHeight / 2 + 4)
      : node.position.y + 3;
  const portSvg = (template.ports ?? [])
    .filter((port) => port.side !== "center")
    .map((port) => {
      const point = getTemplatePortPosition(template, node.position, port);
      return renderTemplatePortSvg(port, point, template.stroke, rules);
    })
    .join("\n");
  const textBoxSvg = (template.textBoxes ?? []).map((box) => renderNodeTextBox(node, template, box, rules)).join("\n");

  return [
    `<g id="${escapeXml(node.id)}">`,
    shape,
    title,
    portSvg,
    textBoxSvg,
    `<text x="${node.position.x}" y="${labelY}" font-family="${rules.label.fontFamily}" font-size="${rules.label.fontSize}" font-weight="${template.labelPosition === "title" ? 700 : 400}" text-anchor="middle" fill="${template.titleColor ?? "#233042"}">${escapeXml(template.label)}</text>`,
    `</g>`
  ].filter(Boolean).join("\n");
}

function renderNodeTextBox(node: PositionedNode, template: { width: number; height: number }, box: TemplateTextBox, rules: StyleRules): string {
  const value = renderTemplateTextBox(box, node);
  if (!value) {
    return "";
  }
  const originX = node.position.x - template.width / 2;
  const originY = node.position.y - template.height / 2;
  return renderTextBoxValue(value, originX + box.x, originY + box.y, box, rules);
}

function renderCableTextBoxes(edge: CableTemplateContext, template: CableTemplate | null, labelPoint: Position, sourcePoint: Position, targetPoint: Position, rules: StyleRules): string {
  if (!template) {
    return "";
  }
  const sourceBox = template.endpointLabels?.sourcePort;
  const targetBox = template.endpointLabels?.targetPort;
  const cableLabel = template.cableLabel;
  const sourceLabelPoint = pointAlongLine(sourcePoint, targetPoint, 42);
  const targetLabelPoint = pointAlongLine(targetPoint, sourcePoint, 42);
  return [
    sourceBox ? renderEndpointBox(renderTemplateTextBox(sourceBox, edge), sourceLabelPoint, sourceBox, rules) : "",
    targetBox ? renderEndpointBox(renderTemplateTextBox(targetBox, edge), targetLabelPoint, targetBox, rules) : "",
    cableLabel ? renderTextBoxValue(renderTemplateTextBox(cableLabel, edge), labelPoint.x - cableLabel.width / 2, labelPoint.y + cableLabel.y, cableLabel, rules) : "",
    ...(template.textBoxes ?? []).map((box) => renderTextBoxValue(renderTemplateTextBox(box, edge), labelPoint.x + box.x - box.width / 2, labelPoint.y + box.y, box, rules))
  ].join("\n");
}

function renderTextBoxValue(value: string, x: number, y: number, box: TemplateTextBox, rules: StyleRules): string {
  if (!value) {
    return "";
  }
  const textX = x + (box.align === "center" ? box.width / 2 : box.align === "right" ? box.width : 0);
  const textAnchor = box.align === "center" ? "middle" : box.align === "right" ? "end" : "start";
  const textY = y + Math.max(10, box.fontSize ?? 10);
  return `<text x="${textX}" y="${textY}" font-family="${rules.label.fontFamily}" font-size="${box.fontSize ?? 10}" text-anchor="${textAnchor}" fill="${box.color ?? "#172033"}">${escapeXml(value)}</text>`;
}

function renderEndpointBox(value: string, point: Position, box: TemplateTextBox, rules: StyleRules): string {
  if (!value) {
    return "";
  }
  const x = point.x - box.width / 2;
  const y = point.y - box.height / 2;
  return [
    `<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="#ffffff" stroke="#111827" stroke-width="1"/>`,
    renderTextBoxValue(value, x, y + Math.max(0, (box.height - (box.fontSize ?? 10)) / 2 - 2), box, rules)
  ].join("\n");
}

function pointAlongLine(from: Position, to: Position, distance: number): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance
  };
}

function renderTemplatePortSvg(port: TemplatePort, point: Position, stroke: string, rules: StyleRules): string {
  if (port.boxWidth && port.boxHeight) {
    const x = point.x - port.boxWidth / 2;
    const y = point.y - port.boxHeight / 2;
    return [
      `<rect x="${x}" y="${y}" width="${port.boxWidth}" height="${port.boxHeight}" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`,
      renderPortLabelSvg(port.connectorLabel, port.connectorName ?? port.label ?? port.id, point, rules),
      renderPortLabelSvg(port.idLabel, port.id, point, rules)
    ].join("\n");
  }
  return [
    `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`,
    renderPortLabelSvg(port.connectorLabel, port.connectorName ?? port.label ?? port.id, point, rules),
    renderPortLabelSvg(port.idLabel, port.id, point, rules)
  ].join("\n");
}

function renderPortLabelSvg(label: TemplatePortLabel | undefined, text: string, point: Position, rules: StyleRules): string {
  if (!label || !text) {
    return "";
  }
  const anchor = label.align === "left" ? "start" : label.align === "right" ? "end" : "middle";
  return `<text x="${point.x + label.x}" y="${point.y + label.y}" font-family="${rules.label.fontFamily}" font-size="${label.fontSize}" text-anchor="${anchor}" fill="${label.color ?? "#172033"}">${escapeXml(text)}</text>`;
}

function renderLegend(viewBox: ViewBox, rules: StyleRules): string {
  const legendItems = buildLegendItems(rules);
  const x = viewBox.minX + viewBox.width - 220;
  const y = viewBox.minY + 28;
  const rows = legendItems.map((item, index) => {
    const rowY = y + 36 + index * 24;
    const dash = item.lineStyle === "dashed" ? ` stroke-dasharray="8 6"` : "";
    return [
      `<line x1="${x + 16}" y1="${rowY}" x2="${x + 70}" y2="${rowY}" stroke="${item.color}" stroke-width="${item.width}"${dash} stroke-linecap="round"/>`,
      `<text x="${x + 82}" y="${rowY + 4}" font-family="${rules.label.fontFamily}" font-size="12" fill="#233042">${escapeXml(item.label)}</text>`
    ].join("\n");
  }).join("\n");

  return [
    `<g id="legend">`,
    `<rect x="${x}" y="${y}" width="190" height="${56 + legendItems.length * 24}" rx="6" fill="#ffffff" stroke="#d8e0e8"/>`,
    `<text x="${x + 16}" y="${y + 22}" font-family="${rules.label.fontFamily}" font-size="14" font-weight="700" fill="#172033">Legend</text>`,
    rows,
    `</g>`
  ].join("\n");
}

function calculateViewBox(graph: PositionedGraph): ViewBox {
  const bendPoints = Object.values(graph.rules.edgeBendPoints ?? {}).flat();
  const nodeBounds = graph.nodes.flatMap((node) => {
    const template = resolveDisplayTemplate(node, graph.displayRules ?? DEFAULT_DISPLAY_RULES);
    return [
      { x: node.position.x - template.width / 2, y: node.position.y - template.height / 2 },
      { x: node.position.x + template.width / 2, y: node.position.y + template.height / 2 }
    ];
  });
  const xs = [...nodeBounds.map((point) => point.x), ...bendPoints.map((point) => point.x)];
  const ys = [...nodeBounds.map((point) => point.y), ...bendPoints.map((point) => point.y)];
  const minX = Math.min(...xs, 0) - 120;
  const minY = Math.min(...ys, 0) - 80;
  const maxX = Math.max(...xs, 0) + 300;
  const maxY = Math.max(...ys, 0) + 140;
  return {
    minX,
    minY,
    width: Math.max(800, maxX - minX),
    height: Math.max(500, maxY - minY)
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
