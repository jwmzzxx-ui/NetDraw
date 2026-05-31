import { describe, expect, test } from "vitest";
import { buildLegendItems, cytoscapeStylesheetFromRules, DEFAULT_STYLE_RULES } from "../src/styleRules.js";

describe("style rules", () => {
  test("keeps network style mappings file-driven and legend-ready", () => {
    expect(Object.keys(DEFAULT_STYLE_RULES.netTypes)).toEqual(["AC", "DC", "COMM", "SIGNAL", "SAFETY"]);

    const legend = buildLegendItems(DEFAULT_STYLE_RULES);
    expect(legend).toHaveLength(5);
    expect(legend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "AC", color: "#d9480f", lineStyle: "solid", width: 3 }),
        expect.objectContaining({ label: "COMM", color: "#2563eb" })
      ])
    );
  });

  test("converts shared rules into Cytoscape stylesheet entries", () => {
    const stylesheet = cytoscapeStylesheetFromRules(DEFAULT_STYLE_RULES);

    expect(stylesheet).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: ".net-safety",
          style: expect.objectContaining({ "line-color": "#dc2626", width: 3 })
        }),
        expect.objectContaining({
          selector: 'node[kind = "route-node"]',
          style: expect.objectContaining({ shape: "hexagon" })
        }),
        expect.objectContaining({
          selector: ".is-highlighted-node",
          style: expect.objectContaining({ "border-width": 3 })
        })
      ])
    );
  });
});
