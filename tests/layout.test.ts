import { describe, expect, test } from "vitest";
import { createPresetLayout, explainPosition } from "../src/layout.js";
import { DEFAULT_DISPLAY_RULES } from "../src/displayRules.js";
import type { CanonicalGraph, DisplayRules, LayoutRules } from "../src/types.js";

const rules: LayoutRules = {
  layerOrder: ["part", "control", "switch", "ipc"],
  dx: 200,
  dy: 20,
  cabinetGap: 1000,
  slotGap: 100,
  boardGap: 10,
  moduleGap: 600,
  deviceOrder: ["PART_A", "CTRL_A", "SW_1"],
  boardOrder: ["BRK_A", "CTRL_BOARD", "LINE_CARD"],
  moduleOrder: ["MODULE-A", "MODULE-B"]
};

describe("createPresetLayout", () => {
  test("places x coordinates by layer order and puts missing layers in custom column", () => {
    const positioned = createPresetLayout(
      graph([
        { id: "device:PART_A", type: "device", displayName: "PART_A", layer: "part" },
        { id: "device:CTRL_A", type: "device", displayName: "CTRL_A", layer: "control" },
        { id: "device:UNKNOWN", type: "device", displayName: "UNKNOWN" }
      ]),
      rules
    );

    expect(positionOf(positioned, "device:PART_A")).toEqual({ x: 0, y: 0 });
    expect(positionOf(positioned, "device:CTRL_A")).toEqual({ x: 200, y: 20 });
    expect(positionOf(positioned, "device:UNKNOWN").x).toBe(0);
    expect(positioned.nodes.find((node) => node.id === "device:UNKNOWN")?.layout.layerId).toBe("L0");
  });

  test("orders y coordinates by cabinet, slot, device, board and order metadata", () => {
    const positioned = createPresetLayout(
      graph([
        {
          id: "board:PART_A/BRK_A",
          type: "board",
          parent: "device:PART_A",
          displayName: "BRK_A",
          layer: "part",
          metadata: { cabinet: "CAB_B", slot: "SLOT_01", order: "0" }
        },
        {
          id: "board:CTRL_A/CTRL_BOARD",
          type: "board",
          parent: "device:CTRL_A",
          displayName: "CTRL_BOARD",
          layer: "part",
          metadata: { cabinet: "CAB_A", slot: "SLOT_02", order: "0" }
        },
        {
          id: "board:SW_1/LINE_CARD",
          type: "board",
          parent: "device:SW_1",
          displayName: "LINE_CARD",
          layer: "part",
          metadata: { cabinet: "CAB_A", slot: "SLOT_01", order: "1" }
        }
      ]),
      rules
    );

    expect(positionOf(positioned, "board:SW_1/LINE_CARD").y).toBe(80);
    expect(positionOf(positioned, "board:CTRL_A/CTRL_BOARD").y).toBe(130);
    expect(positionOf(positioned, "board:PART_A/BRK_A").y).toBe(1000);
  });

  test("applies override positions and explains why a node was placed", () => {
    const positioned = createPresetLayout(
      graph([{ id: "device:CTRL_A", type: "device", displayName: "CTRL_A", layer: "control" }]),
      {
        ...rules,
        overridePositions: {
          "device:CTRL_A": { x: 777, y: 888 }
        }
      }
    );

    expect(positionOf(positioned, "device:CTRL_A")).toEqual({ x: 777, y: 888 });
    expect(explainPosition(positioned, "device:CTRL_A")).toContain("override");
  });

  test("groups y coordinates by module before cabinet and device order", () => {
    const positioned = createPresetLayout(
      graph([
        {
          id: "device:PART_A",
          type: "device",
          displayName: "PART_A",
          layer: "part",
          metadata: { module: "MODULE-B" }
        },
        {
          id: "device:CTRL_A",
          type: "device",
          displayName: "CTRL_A",
          layer: "control",
          metadata: { module: "MODULE-A" }
        }
      ]),
      rules
    );

    expect(positionOf(positioned, "device:CTRL_A").y).toBe(20);
    expect(positionOf(positioned, "device:PART_A").y).toBe(600);
    expect(positioned.nodes.find((node) => node.id === "device:PART_A")?.layout.module).toBe("MODULE-B");
  });

  test("offsets overlapping final coordinates and records a warning", () => {
    const positioned = createPresetLayout(
      graph([
        { id: "device:A", type: "device", displayName: "A", layer: "part" },
        { id: "device:B", type: "device", displayName: "B", layer: "part" }
      ]),
      {
        ...rules,
        overridePositions: {
          "device:A": { x: 10, y: 10 },
          "device:B": { x: 10, y: 10 }
        }
      }
    );

    expect(positionOf(positioned, "device:A")).toEqual({ x: 10, y: 10 });
    expect(positionOf(positioned, "device:B")).toEqual({ x: 11, y: 11 });
    expect(positioned.warnings).toEqual([
      expect.objectContaining({
        code: "POSITION_COLLISION",
        nodeId: "device:B"
      })
    ]);
  });

  test("places child ports on parent template anchors unless manually overridden", () => {
    const displayRules: DisplayRules = {
      ...DEFAULT_DISPLAY_RULES,
      nodeTemplates: { "board:PART_A/BRK_A": "breakout-panel" }
    };
    const positioned = createPresetLayout(
      graph([
        { id: "board:PART_A/BRK_A", type: "board", displayName: "BRK_A", layer: "part" },
        {
          id: "port:PART_A/BRK_A/PWR_IN",
          type: "port",
          parent: "board:PART_A/BRK_A",
          displayName: "PWR_IN",
          layer: "part",
          metadata: { templateParams: "{\"anchorId\":\"left-in\"}" }
        },
        {
          id: "port:PART_A/BRK_A/OUT",
          type: "port",
          parent: "board:PART_A/BRK_A",
          displayName: "OUT",
          layer: "part",
          metadata: { templateParams: "{\"anchorId\":\"right-upper\"}" }
        }
      ]),
      rules,
      displayRules
    );

    expect(positionOf(positioned, "port:PART_A/BRK_A/PWR_IN")).toEqual({ x: -75, y: -40 });
    expect(positionOf(positioned, "port:PART_A/BRK_A/OUT")).toEqual({ x: 75, y: -40 });

    const overridden = createPresetLayout(
      graph([
        { id: "board:PART_A/BRK_A", type: "board", displayName: "BRK_A", layer: "part" },
        {
          id: "port:PART_A/BRK_A/PWR_IN",
          type: "port",
          parent: "board:PART_A/BRK_A",
          displayName: "PWR_IN",
          layer: "part",
          metadata: { templateParams: "{\"anchorId\":\"left-in\"}" }
        }
      ]),
      { ...rules, overridePositions: { "port:PART_A/BRK_A/PWR_IN": { x: 333, y: 444 } } },
      displayRules
    );
    expect(positionOf(overridden, "port:PART_A/BRK_A/PWR_IN")).toEqual({ x: 333, y: 444 });
  });
});

function graph(nodes: CanonicalGraph["nodes"]): CanonicalGraph {
  return { nodes, edges: [] };
}

function positionOf(positioned: ReturnType<typeof createPresetLayout>, nodeId: string): { x: number; y: number } {
  const node = positioned.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }
  return node.position;
}
