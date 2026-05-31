import { describe, expect, test } from "vitest";
import { buildOverrideRulesPatch, updateEdgeBendPoints, updateOverridePosition } from "../webapp/src/overrides.js";

describe("manual override export", () => {
  test("builds a stable rules patch from moved node positions", () => {
    const patch = buildOverrideRulesPatch({
      "port:B/BOARD/P2": { x: 200.4, y: 9.6 },
      "port:A/BOARD/P1": { x: 10.2, y: 20.8 }
    });

    expect(patch).toEqual({
      layout: {
        overridePositions: {
          "port:A/BOARD/P1": { x: 10, y: 21 },
          "port:B/BOARD/P2": { x: 200, y: 10 }
        }
      }
    });
    expect(JSON.stringify(patch, null, 2)).toContain('"overridePositions"');
  });

  test("updates one node position without mutating the previous override map", () => {
    const previous = {
      "port:A/BOARD/P1": { x: 10, y: 20 }
    };

    const next = updateOverridePosition(previous, "port:B/BOARD/P2", { x: 31.49, y: 41.5 });

    expect(previous).toEqual({ "port:A/BOARD/P1": { x: 10, y: 20 } });
    expect(next).toEqual({
      "port:A/BOARD/P1": { x: 10, y: 20 },
      "port:B/BOARD/P2": { x: 31, y: 42 }
    });
  });

  test("builds a rules patch with stable edge bend points", () => {
    const patch = buildOverrideRulesPatch(
      {},
      {
        "route-segment:C-002:0": [{ x: 70.6, y: 80.2 }],
        "cable:C-001": [{ x: 30.4, y: 40.5 }]
      }
    );

    expect(patch).toEqual({
      layout: {
        edgeBendPoints: {
          "cable:C-001": [{ x: 30, y: 41 }],
          "route-segment:C-002:0": [{ x: 71, y: 80 }]
        }
      }
    });
  });

  test("updates one edge bend list without mutating the previous map", () => {
    const previous = {
      "cable:C-001": [{ x: 10, y: 20 }]
    };

    const next = updateEdgeBendPoints(previous, "cable:C-001", [
      { x: 10, y: 20 },
      { x: 31.3, y: 41.7 }
    ]);

    expect(previous).toEqual({ "cable:C-001": [{ x: 10, y: 20 }] });
    expect(next).toEqual({
      "cable:C-001": [
        { x: 10, y: 20 },
        { x: 31, y: 42 }
      ]
    });
  });
});
