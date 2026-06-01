import { describe, expect, test } from "vitest";
import { applyComponentMetadata, parseComponentsCsv } from "../src/components.js";
import { createPresetLayout } from "../src/layout.js";
import { buildCanonicalGraph } from "../src/model.js";
import type { InterfaceRow } from "../src/types.js";

describe("components metadata", () => {
  test("parses component metadata with aliases", () => {
    const components = parseComponentsCsv(`node_id,component_type,layer,module,cabinet,slot,order,display_name,template_id,template_variant,template_params
device:PART_A,part,part,MODULE-A,CAB-A,SLOT-01,2,Part Alpha,part-sensor,left,"{""anchorId"":""left""}"
board:PART_A/BRK_A,breakout_board,breakout,MODULE-A,CAB-A,SLOT-01,3,Breakout A,,,
`);

    expect(components).toEqual([
      expect.objectContaining({
        nodeId: "device:PART_A",
        componentType: "part",
        layer: "part",
        module: "MODULE-A",
        cabinet: "CAB-A",
        slot: "SLOT-01",
        order: "2",
        displayName: "Part Alpha",
        templateId: "part-sensor",
        templateVariant: "left",
        templateParams: "{\"anchorId\":\"left\"}"
      }),
      expect.objectContaining({ nodeId: "board:PART_A/BRK_A", componentType: "breakout_board" })
    ]);
  });

  test("parses PDM_Code as pdmCode and keeps legacy code aliases compatible", () => {
    const components = parseComponentsCsv(`component_id,component_type,component_name,PDM_Code,ports
5165113,part,Photo Sensor,5165113,"[{""port_id"":""5_488_CT85"",""connector_name"":""H2*2""}]"
LEGACY,part,Legacy Sensor,OLD-001,"[]"
`);

    expect(components[0]).toEqual(expect.objectContaining({ componentId: "5165113", pdmCode: "5165113" }));
    expect(components[0].ports).toEqual([expect.objectContaining({ portId: "5_488_CT85", connectorName: "H2*2" })]);
    const legacy = parseComponentsCsv(`component_id,component_type,component_name,component_code
LEGACY,part,Legacy Sensor,OLD-001
`);
    expect(legacy[0]).toEqual(expect.objectContaining({ pdmCode: "OLD-001", componentCode: "OLD-001" }));
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

    const component = enriched.nodes.find((node) => node.id === "component:PART_A_BRK_A");
    expect(component).toEqual(
      expect.objectContaining({
        layer: "L1",
        metadata: expect.objectContaining({
          layerId: "L1",
          legacyLayer: "breakout",
          componentType: "port",
          cabinet: "CAB-A",
          slot: "SLOT-02",
          order: "6"
        })
      })
    );
    expect(component?.ports).toEqual(expect.arrayContaining([expect.objectContaining({ portId: "PWR_IN" })]));

    const positioned = createPresetLayout(enriched);
    const positionedComponent = positioned.nodes.find((node) => node.id === "component:PART_A_BRK_A");
    expect(positionedComponent?.layout.layer).toBe("L1");
    expect(positionedComponent?.layout.layerId).toBe("L1");
    expect(positionedComponent?.layout.module).toBe("");
    expect(positionedComponent?.layout.cabinet).toBe("CAB-A");
    expect(positionedComponent?.layout.slot).toBe("SLOT-02");
  });

  test("applies module metadata into graph nodes and positioned layout", () => {
    const enriched = applyComponentMetadata(
      buildCanonicalGraph(rows),
      parseComponentsCsv(`node_id,type,layer,module,cabinet,slot,order
device:PART_A,part,part,MODULE-A,CAB-A,SLOT-01,1
board:PART_A/BRK_A,breakout,breakout,MODULE-A,CAB-A,SLOT-01,2
port:PART_A/BRK_A/PWR_IN,port,breakout,MODULE-A,CAB-A,SLOT-01,3
`)
    );

    const component = enriched.nodes.find((node) => node.id === "component:PART_A_BRK_A");
    expect(component?.metadata?.module).toBe("MODULE-A");

    const positioned = createPresetLayout(enriched);
    const positionedComponent = positioned.nodes.find((node) => node.id === "component:PART_A_BRK_A");
    expect(positionedComponent?.layout.module).toBe("MODULE-A");
    expect(positionedComponent?.layout.reason).toContain("module=MODULE-A");
  });

  test("applies display template metadata to graph nodes", () => {
    const enriched = applyComponentMetadata(
      buildCanonicalGraph(rows),
      parseComponentsCsv(`node_id,type,layer,template_id,template_variant,template_params
port:PART_A/BRK_A/PWR_IN,port,breakout,connector-port,left-in,"{""anchorId"":""left-in""}"
`)
    );

    const component = enriched.nodes.find((node) => node.id === "component:PART_A_BRK_A");
    expect(component?.metadata).toEqual(
      expect.objectContaining({
        templateId: "connector-port",
        templateVariant: "left-in",
        templateParams: "{\"anchorId\":\"left-in\"}"
      })
    );
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
