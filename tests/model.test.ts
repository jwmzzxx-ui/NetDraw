import { describe, expect, test } from "vitest";
import { buildCanonicalGraph, createCanonicalGraph, renderModelDiagnosticsMarkdown, traceCable } from "../src/model.js";
import { normalizeInterfaceRows } from "../src/normalizer.js";
import type { InterfaceRow, ResolvedCableRoute } from "../src/types.js";

const rows: InterfaceRow[] = [
  {
    rowId: "R001",
    srcDevice: "Device A",
    srcBoard: "Board A",
    srcPort: "P1",
    dstDevice: "Device B",
    dstBoard: "Board B",
    dstPort: "P2",
    netType: "COMM",
    medium: "ethernet",
    cableId: "C-001",
    cableType: "CAT6",
    routeHint: "TRAY_1>SW_1"
  }
];

describe("buildCanonicalGraph", () => {
  test("creates stable component nodes with embedded ports and logical cable edges", () => {
    const graph = buildCanonicalGraph(rows);

    expect(graph.nodes.map((node) => node.id)).toEqual(["component:Device_A_Board_A", "component:Device_B_Board_B"]);
    expect(graph.nodes[0]).toEqual(expect.objectContaining({
      type: "component",
      ports: [expect.objectContaining({ portId: "P1" })]
    }));
    expect(graph.edges).toEqual([
      expect.objectContaining({
        id: "cable:C-001",
        type: "logical-cable",
        source: "component:Device_A_Board_A",
        target: "component:Device_B_Board_B",
        sourcePortId: "P1",
        targetPortId: "P2",
        cableId: "C-001",
        netType: "COMM"
      })
    ]);
  });

  test("adds route nodes and route-segment edges for resolved cable routes", () => {
    const routes: ResolvedCableRoute[] = [
      {
        cableId: "C-001",
        algorithm: "explicit",
        routeNodes: ["TRAY_1", "SW_1"],
        routeSegments: [{ source: "TRAY_1", target: "SW_1", cost: 1 }],
        routeString: "TRAY_1>SW_1"
      }
    ];

    const graph = buildCanonicalGraph(rows, routes);

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "route:TRAY_1", type: "route-node" }),
        expect.objectContaining({ id: "route:SW_1", type: "route-node" })
      ])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route-segment:C-001:0",
          type: "route-segment",
          source: "route:TRAY_1",
          target: "route:SW_1",
          cableId: "C-001"
        })
      ])
    );
  });

  test("uses normalized endpoint slugs for stable node ids while preserving display and original names", () => {
    const normalized = normalizeInterfaceRows(
      [
        rows[0],
        {
          ...rows[0],
          rowId: "R002",
          srcDevice: "Control-A",
          cableId: "C-002"
        }
      ],
      {
        devices: {
          "Device A": { normalizedName: "CTRL_A", displayName: "Control A" },
          "Control-A": { normalizedName: "CTRL_A", displayName: "Control A" }
        }
      }
    ).rows;

    const graph = buildCanonicalGraph(normalized);
    const component = graph.nodes.find((node) => node.id === "component:CTRL_A_Board_A");

    expect(graph.nodes.filter((node) => node.id === "component:CTRL_A_Board_A")).toHaveLength(1);
    expect(component).toEqual(
      expect.objectContaining({
        displayName: "Control A/Board A",
        metadata: expect.objectContaining({
          originalNames: "Device A/Board A | Control-A/Board A",
          normalizedName: "CTRL_A/Board A"
        })
      })
    );
    expect(graph.edges.map((edge) => edge.source)).toEqual(["component:CTRL_A_Board_A", "component:CTRL_A_Board_A"]);
  });

  test("builds query indexes and diagnostics for the canonical graph", () => {
    const routes: ResolvedCableRoute[] = [
      {
        cableId: "C-001",
        algorithm: "explicit",
        routeNodes: ["TRAY_1", "SW_1"],
        routeSegments: [{ source: "TRAY_1", target: "SW_1", cost: 1 }],
        routeString: "TRAY_1>SW_1"
      }
    ];

    const graph = buildCanonicalGraph(rows, routes);
    const indexes = graph.indexes;

    expect(indexes).toBeDefined();
    expect(indexes?.byId["component:Device_A_Board_A"]).toEqual({ kind: "node", index: 0 });
    expect(indexes?.byId["cable:C-001"]).toEqual({ kind: "edge", index: 0 });
    expect(indexes?.byCableId["C-001"]).toEqual({
      logicalCableEdgeIds: ["cable:C-001"],
      routeSegmentEdgeIds: ["route-segment:C-001:0"]
    });
    expect(indexes?.byParent).toEqual({});
    expect(graph.diagnostics).toEqual([]);
  });

  test("traces a logical cable to both endpoint ports and its route segment chain", () => {
    const graph = buildCanonicalGraph(rows, [
      {
        cableId: "C-001",
        algorithm: "explicit",
        routeNodes: ["TRAY_1", "SW_1"],
        routeSegments: [{ source: "TRAY_1", target: "SW_1", cost: 1 }],
        routeString: "TRAY_1>SW_1"
      }
    ]);

    const trace = traceCable(graph, "C-001");

    expect(trace).toEqual(
      expect.objectContaining({
        cableId: "C-001",
        logicalCable: expect.objectContaining({ id: "cable:C-001" }),
        sourceComponent: expect.objectContaining({ id: "component:Device_A_Board_A" }),
        targetComponent: expect.objectContaining({ id: "component:Device_B_Board_B" }),
        sourcePort: expect.objectContaining({ portId: "P1" }),
        targetPort: expect.objectContaining({ portId: "P2" }),
        routeSegments: [expect.objectContaining({ id: "route-segment:C-001:0" })],
        routeNodeIds: ["route:TRAY_1", "route:SW_1"]
      })
    );
  });

  test("renders model diagnostics as a markdown report", () => {
    const graph = createCanonicalGraph(
      [{ id: "device:A", type: "device", displayName: "A" }],
      [
        {
          id: "cable:C-001",
          type: "logical-cable",
          source: "port:MISSING_A",
          target: "port:MISSING_B",
          cableId: "C-001",
          netType: "COMM",
          medium: "ethernet",
          sourceRow: rows[0]
        }
      ]
    );

    const markdown = renderModelDiagnosticsMarkdown(graph.diagnostics ?? []);

    expect(markdown).toContain("# NetDraw Model Diagnostics");
    expect(markdown).toContain("MISSING_EDGE_ENDPOINT");
    expect(markdown).toContain("cable:C-001");
  });
});
