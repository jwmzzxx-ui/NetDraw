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
  test("creates stable device, board, port nodes and logical cable edges", () => {
    const graph = buildCanonicalGraph(rows);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "device:Device_A",
      "board:Device_A/Board_A",
      "port:Device_A/Board_A/P1",
      "device:Device_B",
      "board:Device_B/Board_B",
      "port:Device_B/Board_B/P2"
    ]);
    expect(graph.edges).toEqual([
      expect.objectContaining({
        id: "cable:C-001",
        type: "logical-cable",
        source: "port:Device_A/Board_A/P1",
        target: "port:Device_B/Board_B/P2",
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
    const device = graph.nodes.find((node) => node.id === "device:CTRL_A");

    expect(graph.nodes.filter((node) => node.id === "device:CTRL_A")).toHaveLength(1);
    expect(device).toEqual(
      expect.objectContaining({
        displayName: "Control A",
        metadata: expect.objectContaining({
          originalNames: "Device A | Control-A",
          normalizedName: "CTRL_A"
        })
      })
    );
    expect(graph.edges.map((edge) => edge.source)).toEqual(["port:CTRL_A/Board_A/P1", "port:CTRL_A/Board_A/P1"]);
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
    expect(indexes?.byId["port:Device_A/Board_A/P1"]).toEqual({ kind: "node", index: 2 });
    expect(indexes?.byId["cable:C-001"]).toEqual({ kind: "edge", index: 0 });
    expect(indexes?.byCableId["C-001"]).toEqual({
      logicalCableEdgeIds: ["cable:C-001"],
      routeSegmentEdgeIds: ["route-segment:C-001:0"]
    });
    expect(indexes?.byParent["board:Device_A/Board_A"]).toEqual(["port:Device_A/Board_A/P1"]);
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
        sourcePort: expect.objectContaining({ id: "port:Device_A/Board_A/P1" }),
        targetPort: expect.objectContaining({ id: "port:Device_B/Board_B/P2" }),
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
