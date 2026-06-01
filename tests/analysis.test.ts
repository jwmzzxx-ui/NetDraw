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
      expect.arrayContaining(["component:A_BOARD", "component:B_BOARD"])
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
        source: "component:A_BOARD",
        target: "component:B_BOARD",
        edgeIds: ["cable:C-001", "cable:C-002"]
      }
    ]);
    expect(report.visualSuggestions.summaryEdgeIds).toEqual(["summary:component:A_BOARD->component:B_BOARD"]);
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
        { id: "component:ORPHAN_BOARD", type: "component", displayName: "ORPHAN/BOARD", ports: [{ portId: "P1" }] },
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
        expect.objectContaining({ code: "ISOLATED_PORT", severity: "info", nodeId: "component:ORPHAN_BOARD" }),
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
    expect(markdown).toContain("summary:component:A_BOARD->component:B_BOARD");
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
