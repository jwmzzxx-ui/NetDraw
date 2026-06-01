import type { StylesheetStyle } from "cytoscape";
import type { DisplayRules, NetType } from "./types.js";

export interface NetTypeStyleRule {
  label: NetType;
  color: string;
  lineStyle: "solid" | "dashed";
  width: number;
}

export interface NodeKindStyleRule {
  fill: string;
  stroke: string;
  width: number;
  height: number;
  shape: "round-rectangle" | "hexagon";
}

export interface StyleRules {
  nodes: Record<"base" | "component" | "route-node", NodeKindStyleRule> & Partial<Record<"device" | "board" | "port", NodeKindStyleRule>>;
  netTypes: Record<NetType, NetTypeStyleRule>;
  routeSegment: {
    color: string;
    width: number;
    lineStyle: "dashed";
  };
  label: {
    fontFamily: string;
    fontSize: number;
    minZoomedFontSize: number;
  };
}

export interface LegendItem {
  label: NetType;
  color: string;
  lineStyle: "solid" | "dashed";
  width: number;
}

export const DEFAULT_STYLE_RULES: StyleRules = {
  nodes: {
    base: { fill: "#ffffff", stroke: "#9aa8b8", width: 42, height: 24, shape: "round-rectangle" },
    component: { fill: "#ffffff", stroke: "#737373", width: 190, height: 96, shape: "round-rectangle" },
    device: { fill: "#eef4ff", stroke: "#4777c5", width: 78, height: 36, shape: "round-rectangle" },
    board: { fill: "#f4f7f9", stroke: "#7a899a", width: 64, height: 28, shape: "round-rectangle" },
    port: { fill: "#ffffff", stroke: "#b7c0ca", width: 44, height: 22, shape: "round-rectangle" },
    "route-node": { fill: "#fff7e7", stroke: "#c98722", width: 54, height: 22, shape: "hexagon" }
  },
  netTypes: {
    AC: { label: "AC", color: "#d9480f", lineStyle: "solid", width: 3 },
    DC: { label: "DC", color: "#0f7b6c", lineStyle: "solid", width: 2 },
    COMM: { label: "COMM", color: "#2563eb", lineStyle: "solid", width: 2 },
    SIGNAL: { label: "SIGNAL", color: "#7c3aed", lineStyle: "dashed", width: 2 },
    SAFETY: { label: "SAFETY", color: "#dc2626", lineStyle: "solid", width: 3 }
  },
  routeSegment: {
    color: "#a76f17",
    width: 1.5,
    lineStyle: "dashed"
  },
  label: {
    fontFamily: "Inter, Segoe UI, sans-serif",
    fontSize: 10,
    minZoomedFontSize: 10
  }
};

export function buildLegendItems(rules: StyleRules = DEFAULT_STYLE_RULES): LegendItem[] {
  return Object.values(rules.netTypes).map((rule) => ({
    label: rule.label,
    color: rule.color,
    lineStyle: rule.lineStyle,
    width: rule.width
  }));
}

export function cytoscapeStylesheetFromRules(rules: StyleRules = DEFAULT_STYLE_RULES, _displayRules?: DisplayRules): StylesheetStyle[] {
  const baseNode = rules.nodes.base;
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "font-size": rules.label.fontSize,
        "font-family": rules.label.fontFamily,
        "min-zoomed-font-size": rules.label.minZoomedFontSize,
        "text-valign": "center",
        "text-halign": "center",
        color: "#233042",
        "background-color": baseNode.fill,
        "border-width": 1,
        "border-color": baseNode.stroke,
        width: baseNode.width,
        height: baseNode.height,
        shape: baseNode.shape
      }
    },
    nodeKindStyle("component", rules.nodes.component, { "font-weight": 700 }),
    ...(rules.nodes.device ? [nodeKindStyle("device", rules.nodes.device, { "font-weight": 700 })] : []),
    ...(rules.nodes.board ? [nodeKindStyle("board", rules.nodes.board)] : []),
    ...(rules.nodes.port ? [nodeKindStyle("port", rules.nodes.port)] : []),
    nodeKindStyle("route-node", rules.nodes["route-node"]),
    {
      selector: ".has-template",
      style: {
        width: "data(templateWidth)",
        height: "data(templateHeight)",
        shape: "data(templateShape)" as never,
        "background-color": "rgba(0, 0, 0, 0)",
        "border-color": "rgba(0, 0, 0, 0)",
        "border-width": 0,
        "background-image": "data(templateBackground)",
        "background-fit": "contain",
        "background-clip": "none",
        "background-opacity": 1,
        "z-index": 10
      }
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "curve-style": "taxi",
        "taxi-direction": "horizontal",
        "line-color": "#7b8794",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#7b8794",
        "font-size": 9,
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.9,
        "text-background-padding": "2px"
      }
    },
    {
      selector: ".route-segment",
      style: {
        "line-style": rules.routeSegment.lineStyle,
        width: rules.routeSegment.width,
        "target-arrow-shape": "none",
        "line-color": rules.routeSegment.color
      }
    },
    {
      selector: ".has-bends",
      style: {
        "curve-style": "segments",
        "segment-distances": "data(segmentDistances)",
        "segment-weights": "data(segmentWeights)"
      }
    },
    ...Object.entries(rules.netTypes).map(([netType, rule]) => ({
      selector: `.net-${netType.toLowerCase()}`,
      style: {
        "line-color": rule.color,
        "target-arrow-color": rule.color,
        "line-style": rule.lineStyle,
        width: rule.width
      }
    })),
    {
      selector: ".has-cable-template",
      style: {
        "line-color": "data(cableStroke)",
        "target-arrow-color": "data(cableStroke)",
        width: "data(cableStrokeWidth)",
        "line-style": "data(cableLineStyle)" as never,
        label: "data(cableCenterLabel)",
        "source-label": "data(cableSourceLabel)",
        "target-label": "data(cableTargetLabel)",
        "source-text-offset": 34,
        "target-text-offset": 34,
        "text-background-color": "#ffffff",
        "text-background-opacity": 1,
        "text-background-padding": "3px",
        "text-border-color": "#111827",
        "text-border-opacity": 1,
        "text-border-width": 1
      }
    },
    { selector: ".is-highlighted", style: { width: 5, "z-index": 99, label: "data(cableCenterLabel)", "source-label": "data(cableSourceLabel)", "target-label": "data(cableTargetLabel)" } },
    {
      selector: ".is-highlighted-node",
      style: {
        "overlay-color": "#111827",
        "overlay-opacity": 0.12,
        "overlay-padding": 10,
        "z-index": 98
      }
    }
  ];
}

function nodeKindStyle(kind: keyof StyleRules["nodes"], rule: NodeKindStyleRule, extra: Record<string, string | number> = {}): StylesheetStyle {
  return {
    selector: `node[kind = "${kind}"]`,
    style: {
      width: rule.width,
      height: rule.height,
      shape: rule.shape,
      "background-color": rule.fill,
      "border-color": rule.stroke,
      ...extra
    }
  };
}
