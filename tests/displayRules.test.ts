import { describe, expect, test } from "vitest";
import { buildCableTemplateContext, buildTemplateBackgroundDataUri, buildTemplateSvg, mergeDisplayRules, renderTemplateTextBox, resolveCableTemplate, resolveDisplayTemplate } from "../src/displayRules.js";
import type { GraphEdge, GraphNode } from "../src/types.js";

describe("display rules", () => {
  test("normalizes legacy anchors into ports", () => {
    const rules = mergeDisplayRules({
      templates: {
        legacy: {
          id: "legacy",
          label: "Legacy",
          width: 100,
          height: 60,
          shape: "rectangle",
          fill: "#ffffff",
          stroke: "#111111",
          anchors: [{ id: "A1", label: "A1", side: "left", offset: 0.4 }]
        }
      },
      kindTemplates: { device: "legacy" }
    });
    const node: GraphNode = { id: "device:A", type: "device", displayName: "A" };

    const template = resolveDisplayTemplate(node, rules);

    expect(template.ports).toEqual([
      expect.objectContaining({
        id: "A1",
        label: "A1",
        connectorName: "A1",
        side: "left",
        offset: 0.4,
        idLabel: expect.objectContaining({ fontSize: 7 }),
        connectorLabel: expect.objectContaining({ fontSize: 8 })
      })
    ]);
    expect(template.anchors).toEqual(template.ports);
  });

  test("keeps template labels unless a node override explicitly changes them", () => {
    const node: GraphNode = { id: "device:A", type: "device", displayName: "LAN1" };
    const rules = mergeDisplayRules({
      templates: {
        custom: {
          id: "custom",
          label: "Plain device",
          width: 100,
          height: 60,
          shape: "round-rectangle",
          fill: "#ffffff",
          stroke: "#111111"
        }
      },
      kindTemplates: { device: "custom" }
    });

    expect(resolveDisplayTemplate(node, rules).label).toBe("Plain device");
    expect(resolveDisplayTemplate(node, { ...rules, templateOverrides: { "device:A": { label: "LAN1" } } }).label).toBe("LAN1");
  });

  test("resolves node and cable text box field paths", () => {
    const node: GraphNode = { id: "device:A", type: "device", displayName: "Pump", metadata: { slot: "SLOT-1" } };
    const edge: GraphEdge = {
      id: "cable:C-1",
      type: "logical-cable",
      source: "device:A",
      target: "device:B",
      cableId: "C-1",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R1",
        srcDevice: "A",
        srcBoard: "B1",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "B2",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        remarks: "Cable note"
      }
    };

    expect(renderTemplateTextBox({ id: "slot", x: 0, y: 0, width: 80, height: 16, bind: "metadata.slot" }, node)).toBe("SLOT-1");
    expect(renderTemplateTextBox({ id: "remarks", x: 0, y: 0, width: 80, height: 16, bind: "sourceRow.remarks" }, edge)).toBe("Cable note");
  });

  test("provides the default logical cable template", () => {
    const edge: GraphEdge = {
      id: "cable:C-1",
      type: "logical-cable",
      source: "a",
      target: "b",
      cableId: "C-1",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R1",
        srcDevice: "A",
        srcBoard: "B1",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "B2",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet"
      }
    };

    expect(resolveCableTemplate(edge).templateId).toBe("connector-cable");
    expect(resolveCableTemplate(edge, {
      templates: {},
      cableTemplates: {
        custom: { id: "custom", label: "Custom cable", stroke: "#111111", strokeWidth: 4 }
      },
      edgeTemplates: { "cable:C-1": "custom" }
    }).templateId).toBe("custom");
  });

  test("binds component templates by PDM code before kind defaults", () => {
    const node: GraphNode = {
      id: "component:5165113",
      type: "component",
      displayName: "Photo Sensor",
      componentName: "Photo Sensor",
      pdmCode: "5165113"
    };
    const rules = mergeDisplayRules({
      templates: {
        "pdm-code:5165113": {
          id: "pdm-code:5165113",
          label: "",
          width: 210,
          height: 100,
          shape: "round-rectangle",
          fill: "#ffffff",
          stroke: "#737373",
          textBoxes: [
            { id: "name", x: 20, y: 10, width: 170, height: 20, bind: "componentName", align: "center" },
            { id: "pdm", x: 20, y: 40, width: 170, height: 20, bind: "pdmCode", align: "center" }
          ]
        }
      },
      pdmCodeTemplates: { "5165113": "pdm-code:5165113" },
      kindTemplates: { component: "plain-device" }
    });

    const template = resolveDisplayTemplate(node, rules);
    const svg = buildTemplateSvg(template, node);

    expect(template.templateId).toBe("pdm-code:5165113");
    expect(svg).toContain("Photo Sensor");
    expect(svg).toContain("5165113");
  });

  test("resolves cable connector names from endpoint ports", () => {
    const edge: GraphEdge = {
      id: "cable:C-1",
      type: "logical-cable",
      source: "component:A",
      target: "component:B",
      sourcePortId: "5_488_CT85",
      targetPortId: "LAN1",
      cableId: "C-1",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R1",
        srcComponent: "A",
        srcPort: "5_488_CT85",
        dstComponent: "B",
        dstPort: "LAN1",
        netType: "COMM",
        medium: "ethernet"
      }
    };
    const context = buildCableTemplateContext(
      edge,
      { id: "component:A", type: "component", displayName: "A", ports: [{ portId: "5_488_CT85", connectorName: "H2*2" }] },
      { id: "component:B", type: "component", displayName: "B", ports: [{ portId: "LAN1", connectorName: "RJ45" }] }
    );
    const template = resolveCableTemplate(edge);

    expect(renderTemplateTextBox(template.endpointLabels!.sourcePort, context)).toBe("H2*2");
    expect(renderTemplateTextBox(template.endpointLabels!.targetPort, context)).toBe("RJ45");
    expect(renderTemplateTextBox(template.cableLabel!, context)).toBe("C-1");
  });

  test("renders edited display templates as complete shared SVG", () => {
    const node: GraphNode = { id: "device:A", type: "device", displayName: "Pump", metadata: { slot: "SLOT-1" } };
    const svg = buildTemplateSvg(
      {
        id: "custom",
        label: "Edited template",
        width: 188,
        height: 96,
        shape: "ellipse",
        fill: "#ffeecc",
        stroke: "#123456",
        strokeWidth: 3,
        titleFill: "#ddeeff",
        titleColor: "#111827",
        titleHeight: 28,
        labelPosition: "title",
        ports: [
          {
            id: "IN_A",
            connectorName: "Input A",
            side: "left",
            offset: 0.5,
            idLabel: { x: -14, y: -6, fontSize: 7, color: "#172033", align: "center" },
            connectorLabel: { x: -36, y: 8, fontSize: 8, color: "#172033", align: "center" }
          }
        ],
        textBoxes: [{ id: "slot", x: 20, y: 48, width: 90, height: 16, bind: "metadata.slot", fontSize: 10, color: "#334155", align: "center" }]
      },
      node
    );

    expect(svg).toContain("<ellipse");
    expect(svg).toContain('fill="#ffeecc"');
    expect(svg).toContain('fill="#ddeeff"');
    expect(svg).toContain("Edited template");
    expect(svg).toContain("IN_A");
    expect(svg).toContain("Input A");
    expect(svg).toContain("SLOT-1");
  });

  test("renders hexagon templates and editor text placeholders into data URIs", () => {
    const uri = buildTemplateBackgroundDataUri(
      {
        id: "hex",
        label: "Hex template",
        width: 120,
        height: 72,
        shape: "hexagon",
        fill: "#ffffff",
        stroke: "#111111",
        labelPosition: "center",
        textBoxes: [{ id: "remarks", x: 8, y: 44, width: 90, height: 16, bind: "metadata.remarks" }]
      },
      undefined,
      { textBoxPlaceholder: "bind" }
    );
    const svg = decodeURIComponent(uri.split(",", 2)[1] ?? "");

    expect(svg).toContain("<polygon");
    expect(svg).toContain("Hex template");
    expect(svg).toContain("metadata.remarks");
  });
});
