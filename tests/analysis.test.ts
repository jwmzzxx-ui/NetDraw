import { describe, expect, test } from "vitest";
import { analyzeGraph, renderAnalysisMarkdown } from "../src/analysis.js";
import { buildCanonicalGraph } from "../src/model.js";
import type { CanonicalGraph, InterfaceRow } from "../src/types.js";

describe("analyzeGraph", () => {
  test("detects directed cycles through strongly connected components", () => {
    const graph = buildCanonicalGraph([
      row("R001", "A", "P1", "B", "P2", "C-001"),
      row("R002", "B", "P2", "A", "P1", "C-002")
    ]);

    const report = analyzeGraph(graph);

    expect(report.stronglyConnectedComponents).toEqual([
      expect.arrayContaining(["port:A/BOARD/P1", "port:B/BOARD/P2"])
    ]);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DIRECTED_CYCLE",
          severity: "warning"
        })
      ])
    );
  });

  test("reports parallel logical cables with the same source and target", () => {
    const graph = buildCanonicalGraph([
      row("R001", "A", "P1", "B", "P2", "C-001"),
      row("R002", "A", "P1", "B", "P2", "C-002")
    ]);

    const report = analyzeGraph(graph);

    expect(report.parallelEdgeGroups).toEqual([
      {
        source: "port:A/BOARD/P1",
        target: "port:B/BOARD/P2",
        edgeIds: ["cable:C-001", "cable:C-002"]
      }
    ]);
    expect(report.visualSuggestions.summaryEdgeIds).toEqual(["summary:port:A/BOARD/P1->port:B/BOARD/P2"]);
  });

  test("checks redundancy groups for single-member and mixed-net groups", () => {
    const rows = [
      row("R001", "A", "P1", "B", "P2", "C-001", "A", "COMM"),
      row("R002", "C", "P3", "D", "P4", "C-002", "B", "COMM"),
      row("R003", "E", "P5", "F", "P6", "C-003", "B", "SAFETY")
    ];
    const graph = buildCanonicalGraph(rows);

    const report = analyzeGraph(graph);

    expect(report.redundancyGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: "A", edgeIds: ["cable:C-001"], netTypes: ["COMM"] }),
        expect.objectContaining({ groupId: "B", edgeIds: ["cable:C-002", "cable:C-003"], netTypes: ["COMM", "SAFETY"] })
      ])
    );
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["REDUNDANCY_GROUP_SINGLE_MEMBER", "REDUNDANCY_GROUP_MIXED_NET_TYPES"])
    );
  });

  test("reports isolated ports and undefined route nodes", () => {
    const graph: CanonicalGraph = {
      nodes: [
        { id: "port:ORPHAN/BOARD/P1", type: "port", displayName: "P1" },
        { id: "route:KNOWN", type: "route-node", displayName: "KNOWN" }
      ],
      edges: [
        {
          id: "route-segment:C-001:0",
          type: "route-segment",
          source: "route:KNOWN",
          target: "route:MISSING",
          cableId: "C-001",
          netType: "COMM",
          medium: "ethernet",
          sourceRow: row("R001", "A", "P1", "B", "P2", "C-001")
        }
      ]
    };

    const report = analyzeGraph(graph);

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ISOLATED_PORT", severity: "info", nodeId: "port:ORPHAN/BOARD/P1" }),
        expect.objectContaining({ code: "UNDEFINED_ROUTE_NODE", severity: "error", nodeId: "route:MISSING" })
      ])
    );
  });
});

describe("renderAnalysisMarkdown", () => {
  test("renders issue and suggestion sections", () => {
    const graph = buildCanonicalGraph([
      row("R001", "A", "P1", "B", "P2", "C-001"),
      row("R002", "A", "P1", "B", "P2", "C-002")
    ]);

    const markdown = renderAnalysisMarkdown(analyzeGraph(graph));

    expect(markdown).toContain("# NetDraw Analysis Report");
    expect(markdown).toContain("## Issues");
    expect(markdown).toContain("## Visual Suggestions");
    expect(markdown).toContain("summary:port:A/BOARD/P1->port:B/BOARD/P2");
  });
});

function row(
  rowId: string,
  srcDevice: string,
  srcPort: string,
  dstDevice: string,
  dstPort: string,
  cableId: string,
  redundancyGroup?: string,
  netType: InterfaceRow["netType"] = "COMM"
): InterfaceRow {
  return {
    rowId,
    srcDevice,
    srcBoard: "BOARD",
    srcPort,
    dstDevice,
    dstBoard: "BOARD",
    dstPort,
    netType,
    medium: "ethernet",
    cableId,
    redundancyGroup
  };
}
