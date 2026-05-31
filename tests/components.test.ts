import { describe, expect, test } from "vitest";
import { applyComponentMetadata, parseComponentsCsv } from "../src/components.js";
import { createPresetLayout } from "../src/layout.js";
import { buildCanonicalGraph } from "../src/model.js";
import type { InterfaceRow } from "../src/types.js";

describe("components metadata", () => {
  test("parses component metadata with aliases", () => {
    const components = parseComponentsCsv(`node_id,component_type,layer,cabinet,slot,order,display_name
device:PART_A,part,part,CAB-A,SLOT-01,2,Part Alpha
board:PART_A/BRK_A,breakout_board,breakout,CAB-A,SLOT-01,3,Breakout A
`);

    expect(components).toEqual([
      expect.objectContaining({
        nodeId: "device:PART_A",
        componentType: "part",
        layer: "part",
        cabinet: "CAB-A",
        slot: "SLOT-01",
        order: "2",
        displayName: "Part Alpha"
      }),
      expect.objectContaining({ nodeId: "board:PART_A/BRK_A", componentType: "breakout_board" })
    ]);
  });

  test("applies component metadata before preset layout", () => {
    const graph = buildCanonicalGraph(rows);
    const enriched = applyComponentMetadata(
      graph,
      parseComponentsCsv(`node_id,type,layer,cabinet,slot,order
device:PART_A,part,part,CAB-A,SLOT-02,4
board:PART_A/BRK_A,breakout,breakout,CAB-A,SLOT-02,5
port:PART_A/BRK_A/PWR_IN,port,breakout,CAB-A,SLOT-02,6
`)
    );

    const port = enriched.nodes.find((node) => node.id === "port:PART_A/BRK_A/PWR_IN");
    expect(port).toEqual(
      expect.objectContaining({
        layer: "breakout",
        metadata: expect.objectContaining({
          componentType: "port",
          cabinet: "CAB-A",
          slot: "SLOT-02",
          order: "6"
        })
      })
    );

    const positioned = createPresetLayout(enriched);
    const positionedPort = positioned.nodes.find((node) => node.id === "port:PART_A/BRK_A/PWR_IN");
    expect(positionedPort?.layout.layer).toBe("breakout");
    expect(positionedPort?.layout.cabinet).toBe("CAB-A");
    expect(positionedPort?.layout.slot).toBe("SLOT-02");
  });
});

const rows: InterfaceRow[] = [
  {
    rowId: "R001",
    srcDevice: "PART_A",
    srcBoard: "BRK_A",
    srcPort: "PWR_IN",
    dstDevice: "PDU_1",
    dstBoard: "PDU_SLOT",
    dstPort: "OUT_01",
    netType: "AC",
    medium: "power",
    cableId: "CAB-AC-001"
  }
];
