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
  nodes: Record<"base" | "device" | "board" | "port" | "route-node", NodeKindStyleRule>;
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
    nodeKindStyle("device", rules.nodes.device, { "font-weight": 700 }),
    nodeKindStyle("board", rules.nodes.board),
    nodeKindStyle("port", rules.nodes.port),
    nodeKindStyle("route-node", rules.nodes["route-node"]),
    {
      selector: ".has-template",
      style: {
        width: "data(templateWidth)",
        height: "data(templateHeight)",
        shape: "data(templateShape)" as never,
        "background-color": "data(templateFill)",
        "border-color": "data(templateStroke)",
        "border-width": "data(templateStrokeWidth)",
        "background-image": "data(templateBackground)",
        "background-fit": "contain",
        "background-clip": "none",
        "background-opacity": 1
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
    { selector: ".is-highlighted", style: { width: 5, "z-index": 99, label: "data(cableId)" } },
    {
      selector: ".is-highlighted-node",
      style: {
        "border-width": 3,
        "border-color": "#111827",
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
