import { describe, expect, test } from "vitest";
import { buildCytoscapeElements, buildNodeIndex, filterGraphForView, getGraphStats } from "../webapp/src/graphAdapter.js";
import type { PositionedGraph } from "../src/types.js";

const graph: PositionedGraph = {
  rules: {
    layerOrder: ["part", "breakout", "interface", "control", "switch", "ipc", "route"],
    dx: 200,
    dy: 20,
    cabinetGap: 1000,
    slotGap: 100,
    boardGap: 10
  },
  warnings: [],
  nodes: [
    {
      id: "port:A/BOARD/P1",
      type: "port",
      displayName: "P1",
      ports: [{ portId: "P1", connectorName: "H2*2", displayName: "P1" }],
      position: { x: 0, y: 0 },
      layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "BOARD", order: 0, reason: "test" }
    },
    {
      id: "port:B/BOARD/P2",
      type: "port",
      displayName: "P2",
      ports: [{ portId: "P2", connectorName: "RJ45", displayName: "P2" }],
      position: { x: 200, y: 0 },
      layout: { layer: "control", module: "MODULE-B", cabinet: "", slot: "", device: "B", board: "BOARD", order: 0, reason: "test" }
    },
    {
      id: "route:TRAY_1",
      type: "route-node",
      displayName: "TRAY_1",
      position: { x: 400, y: 0 },
      layout: { layer: "route", module: "", cabinet: "", slot: "", device: "TRAY_1", board: "", order: 0, reason: "test" }
    }
  ],
  edges: [
    {
      id: "cable:C-001",
      type: "logical-cable",
      source: "port:A/BOARD/P1",
      target: "port:B/BOARD/P2",
      sourcePortId: "P1",
      targetPortId: "P2",
      cableId: "C-001",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R001",
        srcDevice: "A",
        srcBoard: "BOARD",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "BOARD",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      }
    },
    {
      id: "route-segment:C-001:0",
      type: "route-segment",
      source: "route:TRAY_1",
      target: "port:B/BOARD/P2",
      targetPortId: "P2",
      cableId: "C-001",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R001",
        srcDevice: "A",
        srcBoard: "BOARD",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "BOARD",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      }
    },
    {
      id: "cable:C-002",
      type: "logical-cable",
      source: "port:A/BOARD/P1",
      target: "port:B/BOARD/P2",
      sourcePortId: "P1",
      targetPortId: "P2",
      cableId: "C-002",
      netType: "COMM",
      medium: "ethernet",
      sourceRow: {
        rowId: "R002",
        srcDevice: "A",
        srcBoard: "BOARD",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "BOARD",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-002"
      }
    }
  ]
};

describe("web graph adapter", () => {
  test("builds Cytoscape preset elements with positions", () => {
    const elements = buildCytoscapeElements(graph, {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      highlightedId: "cable:C-001",
      projection: "detail",
      activeModule: null,
      minVisibleLayer: "breakout",
      zoom: 1
    });

    expect(elements.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ id: "port:A/BOARD/P1", label: "", templateLabel: "Connector port", kind: "port", templateId: "connector-port", templateWidth: 58, templatePorts: expect.any(Array), templateTextBoxes: expect.any(Array) }),
          classes: expect.stringContaining("has-template"),
          position: { x: 0, y: 0 }
        })
      ])
    );
    expect(elements.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            id: "cable:C-001",
            netType: "COMM",
            highlighted: true,
            cableTemplateId: "connector-cable",
            sourceConnectorName: "H2*2",
            targetConnectorName: "RJ45",
            cableSourceLabel: "H2*2",
            cableTargetLabel: "RJ45",
            cableCenterLabel: "C-001",
            cableTemplateText: "H2*2 RJ45 C-001"
          }),
          classes: expect.stringContaining("has-cable-template")
        })
      ])
    );
  });

  test("embeds edited display template visuals into node backgrounds", () => {
    const editedGraph: PositionedGraph = {
      ...graph,
      displayRules: {
        templates: {
          "edited-port": {
            id: "edited-port",
            label: "Edited port",
            width: 188,
            height: 96,
            shape: "ellipse",
            fill: "#ffeecc",
            stroke: "#123456",
            strokeWidth: 3,
            titleFill: "#ddeeff",
            titleHeight: 28,
            labelPosition: "title",
            ports: [
              {
                id: "IN_A",
                connectorName: "Input A",
                side: "left",
                offset: 0.5,
                idLabel: { x: -14, y: -6, fontSize: 7, color: "#172033", align: "center" },
                connectorLabel: { x: -34, y: 8, fontSize: 8, color: "#172033", align: "center" }
              }
            ],
            textBoxes: [{ id: "name", x: 20, y: 48, width: 100, height: 16, bind: "displayName", fontSize: 10, color: "#334155", align: "center" }]
          }
        },
        nodeTemplates: { "port:A/BOARD/P1": "edited-port" }
      }
    };

    const elements = buildCytoscapeElements(editedGraph, {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      highlightedId: null,
      projection: "detail",
      activeModule: null,
      zoom: 1
    });
    const node = elements.nodes.find((item) => item.data.id === "port:A/BOARD/P1");
    const svg = decodeURIComponent(String(node?.data.templateBackground).split(",", 2)[1] ?? "");

    expect(node?.data).toEqual(expect.objectContaining({ templateWidth: 188, templateHeight: 96, templateFill: "#ffeecc", templateShape: "ellipse" }));
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('fill="#ffeecc"');
    expect(svg).toContain('fill="#ddeeff"');
    expect(svg).toContain("Edited port");
    expect(svg).toContain("P1");
    expect(svg).toContain("IN_A");
    expect(svg).toContain("Input A");
  });

  test("keeps hierarchy metadata without creating Cytoscape compound nodes", () => {
    const hierarchicalGraph: PositionedGraph = {
      ...graph,
      nodes: [
        {
          id: "device:A",
          type: "device",
          displayName: "A",
          position: { x: -100, y: 0 },
          layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "", order: 0, reason: "test" }
        },
        {
          id: "board:A/BOARD",
          type: "board",
          parent: "device:A",
          displayName: "BOARD",
          position: { x: -50, y: 0 },
          layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "BOARD", order: 1, reason: "test" }
        },
        {
          id: "port:A/BOARD/P1",
          type: "port",
          parent: "board:A/BOARD",
          displayName: "P1",
          position: { x: 0, y: 0 },
          layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "BOARD", order: 2, reason: "test" }
        }
      ]
    };

    const elements = buildCytoscapeElements(hierarchicalGraph, {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      projection: "detail",
      activeModule: null,
      highlightedId: null,
      zoom: 1
    });
    const board = elements.nodes.find((node) => node.data.id === "board:A/BOARD");
    const port = elements.nodes.find((node) => node.data.id === "port:A/BOARD/P1");

    expect(board?.data.parent).toBeUndefined();
    expect(port?.data.parent).toBeUndefined();
    expect(board?.data.parentId).toBe("device:A");
    expect(port?.data.parentId).toBe("board:A/BOARD");
  });

  test("uses layer projection for overview mode and filters route segments", () => {
    const overview = filterGraphForView(graph, { netTypes: new Set(["COMM"]), mode: "overview", highlightedId: null, zoom: 0.5 });
    const detail = filterGraphForView(graph, { netTypes: new Set(["COMM"]), mode: "detail", highlightedId: null, zoom: 1 });

    expect(overview.edges.map((edge) => edge.id)).toEqual(["summary:module:MODULE-A->layer:MODULE-B:control:B/BOARD:COMM"]);
    expect(detail.edges.map((edge) => edge.id)).toEqual(["cable:C-001", "route-segment:C-001:0", "cable:C-002"]);
  });

  test("builds module projection as collapsed module nodes and summary edges", () => {
    const projected = filterGraphForView(graph, {
      netTypes: new Set(["COMM"]),
      mode: "overview",
      projection: "module",
      activeModule: null,
      minVisibleLayer: "breakout",
      highlightedId: null,
      zoom: 0.5
    });

    expect(projected.nodes.map((node) => node.id).sort()).toEqual(["module:MODULE-A", "module:MODULE-B"]);
    expect(projected.edges).toEqual([
      expect.objectContaining({
        id: "summary:module:MODULE-A->module:MODULE-B:COMM",
        source: "module:MODULE-A",
        target: "module:MODULE-B",
        cableId: "2 cables"
      })
    ]);
  });

  test("builds layer projection with module placeholders for hidden part endpoints", () => {
    const projected = filterGraphForView(graph, {
      netTypes: new Set(["COMM"]),
      mode: "overview",
      projection: "layer",
      activeModule: null,
      minVisibleLayer: "breakout",
      highlightedId: null,
      zoom: 0.5
    });

    expect(projected.nodes.map((node) => node.id).sort()).toEqual(["layer:MODULE-B:control:B/BOARD", "module:MODULE-A"]);
    expect(projected.edges[0]).toEqual(
      expect.objectContaining({
        source: "module:MODULE-A",
        target: "layer:MODULE-B:control:B/BOARD",
        cableId: "2 cables"
      })
    );
  });

  test("filters layer projection by selected 0-7 layer ids", () => {
    const projected = filterGraphForView(graph, {
      netTypes: new Set(["COMM"]),
      mode: "overview",
      projection: "layer",
      activeModule: null,
      visibleLayerIds: new Set(["L0"]),
      highlightedId: null,
      zoom: 0.5
    });

    expect(projected.nodes.map((node) => node.id)).toEqual(["port:A/BOARD/P1"]);
    expect(projected.edges).toEqual([]);
  });

  test("filters detail projection to a selected module subgraph and cross-module cables", () => {
    const projected = filterGraphForView(graph, {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      projection: "detail",
      activeModule: "MODULE-A",
      minVisibleLayer: "breakout",
      highlightedId: null,
      zoom: 1
    });

    expect(projected.nodes.map((node) => node.id).sort()).toEqual(["port:A/BOARD/P1", "port:B/BOARD/P2"]);
    expect(projected.edges.map((edge) => edge.id).sort()).toEqual(["cable:C-001", "cable:C-002"]);
  });

  test("calculates graph stats for the sidebar", () => {
    expect(getGraphStats(graph)).toEqual({
      nodes: 3,
      logicalCables: 2,
      routeSegments: 1,
      warnings: 0
    });
  });

  test("keeps template labels inside the shared template background", () => {
    const overview = buildCytoscapeElements(graph, {
      netTypes: new Set(["COMM"]),
      mode: "overview",
      projection: "detail",
      activeModule: null,
      minVisibleLayer: "breakout",
      highlightedId: null,
      zoom: 0.5
    });
    const detailZoomed = buildCytoscapeElements(graph, { netTypes: new Set(["COMM"]), mode: "detail", highlightedId: null, zoom: 1.2 });

    const overviewPort = overview.nodes.find((node) => node.data.id === "port:A/BOARD/P1");
    const detailPort = detailZoomed.nodes.find((node) => node.data.id === "port:A/BOARD/P1");
    expect(overviewPort?.data.label).toBe("");
    expect(detailPort?.data.label).toBe("");
    const svg = decodeURIComponent(String(detailPort?.data.templateBackground).split(",", 2)[1] ?? "");
    expect(svg).toContain("Connector port");
    expect(svg).not.toContain("P1");
  });

  test("builds a by-id node index for lookups", () => {
    const index = buildNodeIndex(graph);
    expect(index.get("route:TRAY_1")?.displayName).toBe("TRAY_1");
  });

  test("maps edge bend points into Cytoscape segment data", () => {
    const bentGraph: PositionedGraph = {
      ...graph,
      rules: {
        ...graph.rules,
        edgeBendPoints: {
          "cable:C-001": [{ x: 100, y: -40 }]
        }
      }
    };

    const elements = buildCytoscapeElements(bentGraph, { netTypes: new Set(["COMM"]), mode: "detail", highlightedId: null, zoom: 1 });
    const bentEdge = elements.edges.find((edge) => edge.data.id === "cable:C-001");

    expect(bentEdge?.classes).toContain("has-bends");
    expect(bentEdge?.data.segmentWeights).toEqual([0.5]);
    expect(bentEdge?.data.segmentDistances).toEqual([-40]);
  });

  test("highlights a selected device neighborhood through child ports and incident cables", () => {
    const neighborhoodGraph: PositionedGraph = {
      ...graph,
      nodes: [
        {
          id: "device:A",
          type: "device",
          displayName: "A",
          position: { x: -100, y: 0 },
          layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "", order: 0, reason: "test" }
        },
        {
          id: "board:A/BOARD",
          type: "board",
          parent: "device:A",
          displayName: "BOARD",
          position: { x: -50, y: 0 },
          layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "BOARD", order: 0, reason: "test" }
        },
        {
          ...graph.nodes[0],
          parent: "board:A/BOARD"
        },
        ...graph.nodes.slice(1)
      ]
    };

    const elements = buildCytoscapeElements(neighborhoodGraph, {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      highlightedId: "device:A",
      zoom: 1.2
    });

    const device = elements.nodes.find((node) => node.data.id === "device:A");
    const childPort = elements.nodes.find((node) => node.data.id === "port:A/BOARD/P1");
    const neighborPort = elements.nodes.find((node) => node.data.id === "port:B/BOARD/P2");
    const cable = elements.edges.find((edge) => edge.data.id === "cable:C-001");
    const routeSegment = elements.edges.find((edge) => edge.data.id === "route-segment:C-001:0");

    expect(device?.data.highlighted).toBe(true);
    expect(device?.classes).toContain("is-highlighted-node");
    expect(childPort?.data.highlighted).toBe(true);
    expect(neighborPort?.data.highlighted).toBe(true);
    expect(cable?.data.highlighted).toBe(true);
    expect(cable?.classes).toContain("is-highlighted");
    expect(routeSegment?.data.highlighted).toBe(false);
  });
});
