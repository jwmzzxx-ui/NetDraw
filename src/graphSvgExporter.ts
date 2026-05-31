import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_DISPLAY_RULES, getTemplateAnchorPosition, resolveDisplayTemplate } from "./displayRules.js";
import { buildLegendItems, DEFAULT_STYLE_RULES, type StyleRules } from "./styleRules.js";
import type { GraphEdge, PositionedGraph, PositionedNode } from "./types.js";

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
  const edgeSvg = graph.edges.map((edge) => renderEdge(edge, nodeById, rules, graph.rules.edgeBendPoints?.[edge.id] ?? [])).join("\n");
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

function renderEdge(edge: GraphEdge, nodeById: Map<string, PositionedNode>, rules: StyleRules, bendPoints: Array<{ x: number; y: number }>): string {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) {
    return "";
  }
  const style = edge.type === "route-segment" ? rules.routeSegment : rules.netTypes[edge.netType as keyof typeof rules.netTypes];
  const color = style?.color ?? "#7b8794";
  const width = style?.width ?? 2;
  const dash = style?.lineStyle === "dashed" ? ` stroke-dasharray="8 6"` : "";
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
    edge.type === "logical-cable"
      ? `<text x="${labelPoint.x}" y="${labelPoint.y}" font-family="${rules.label.fontFamily}" font-size="10" text-anchor="middle" fill="#334155">${escapeXml(edge.cableId)}</text>`
      : "",
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
  const anchorSvg = (template.anchors ?? [])
    .filter((anchor) => anchor.side !== "center")
    .map((anchor) => {
      const point = getTemplateAnchorPosition(template, node.position, anchor);
      return `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#ffffff" stroke="${template.stroke}" stroke-width="1"/>`;
    })
    .join("\n");

  return [
    `<g id="${escapeXml(node.id)}">`,
    shape,
    title,
    anchorSvg,
    `<text x="${node.position.x}" y="${labelY}" font-family="${rules.label.fontFamily}" font-size="${rules.label.fontSize}" font-weight="${template.labelPosition === "title" ? 700 : 400}" text-anchor="middle" fill="${template.titleColor ?? "#233042"}">${escapeXml(template.label)}</text>`,
    `</g>`
  ].filter(Boolean).join("\n");
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
