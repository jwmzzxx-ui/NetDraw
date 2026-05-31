// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NetDrawApp } from "../webapp/src/NetDrawApp.js";
import type { Position, PositionedGraph } from "../src/types.js";

let emitNodePosition: ((nodeId: string, position: Position) => void) | undefined;
let emitSelect: ((id: string | null) => void) | undefined;

vi.mock("../webapp/src/useCytoscapeGraph.js", () => ({
  useCytoscapeGraph: (
    _graph: PositionedGraph,
    _state: unknown,
    onSelect: (id: string | null) => void,
    _onZoomChange: unknown,
    onNodePositionChange?: (nodeId: string, position: Position) => void
  ) => {
    emitNodePosition = onNodePositionChange;
    emitSelect = onSelect;
    return {
      containerRef: { current: null },
      cyRef: { current: null }
    };
  }
}));

vi.mock("../webapp/src/useLocalElkLayout.js", () => ({
  useLocalElkLayout: () => vi.fn()
}));

describe("NetDrawApp import", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    emitNodePosition = undefined;
    emitSelect = undefined;
  });

  test("uploads an interface table through the backend project flow and replaces the graph stats", async () => {
    const graph = fixtureGraph();
    const importRecord = {
      id: "import-1",
      projectId: "project-1",
      status: "completed",
      sourceFileName: "interfaces.csv",
      rowCount: 1,
      logicalCableCount: 1,
      routeSegmentCount: 0,
      createdAt: "2026-05-31T00:00:00.000Z"
    };
    let uploaded = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1", username: "admin", role: "admin", mustChangePassword: false } });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [{ id: "project-1", name: "Line A", description: "Main line", createdAt: "", updatedAt: "" }] });
      }
      if (url === "/api/projects/project-1/imports" && init?.method === "POST") {
        uploaded = true;
        return jsonResponse({
          import: importRecord,
          artifacts: [{ id: "artifact-1", kind: "cable_list_csv", fileName: "cable-list.csv", createdAt: "" }],
          positionedGraph: graph
        });
      }
      if (url === "/api/projects/project-1/imports") {
        return jsonResponse({ imports: uploaded ? [importRecord] : [] });
      }
      return jsonResponse({}, 404);
    }));

    render(<NetDrawApp />);

    await waitFor(() => expect(screen.getByText("Select project")).toBeTruthy());
    fireEvent.click(screen.getByText("Line A"));
    await waitFor(() => expect(screen.getByText("Data import")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open import form" }));
    await waitFor(() => expect(screen.getByLabelText("Interface table")).toBeTruthy());

    const input = screen.getByLabelText("Interface table") as HTMLInputElement;
    const file = new File(
      [
        [
          "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id",
          "R100,PLC_A,IO_A,P1,SW_A,GE_A,P2,COMM,ethernet,CAB-100"
        ].join("\n")
      ],
      "interfaces.csv",
      { type: "text/csv" }
    );

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Start import" }));

    await waitFor(() => expect(screen.getByText("Imported: interfaces.csv")).toBeTruthy());
    expect(screen.getByText("Rows: 1 · Cables: 1")).toBeTruthy();
    expect(screen.getByText("cable-list.csv")).toBeTruthy();
    expect(screen.getByText("Template: interface-template.csv")).toBeTruthy();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fixtureGraph(): PositionedGraph {
  return {
    rules: { layerOrder: ["part", "control"], dx: 200, dy: 20, cabinetGap: 1000, slotGap: 100, boardGap: 10 },
    warnings: [],
    nodes: [
      {
        id: "port:A/BOARD/P1",
        type: "port",
        displayName: "P1",
        position: { x: 0, y: 0 },
        layout: { layer: "part", module: "MODULE-A", cabinet: "", slot: "", device: "A", board: "BOARD", order: 0, reason: "test" }
      },
      {
        id: "port:B/BOARD/P2",
        type: "port",
        displayName: "P2",
        position: { x: 200, y: 0 },
        layout: { layer: "control", module: "MODULE-B", cabinet: "", slot: "", device: "B", board: "BOARD", order: 0, reason: "test" }
      }
    ],
    edges: [
      {
        id: "cable:CAB-100",
        type: "logical-cable",
        source: "port:A/BOARD/P1",
        target: "port:B/BOARD/P2",
        cableId: "CAB-100",
        netType: "COMM",
        medium: "ethernet",
        sourceRow: {
          rowId: "R100",
          srcDevice: "A",
          srcBoard: "BOARD",
          srcPort: "P1",
          dstDevice: "B",
          dstBoard: "BOARD",
          dstPort: "P2",
          netType: "COMM",
          medium: "ethernet",
          cableId: "CAB-100"
        }
      }
    ]
  };
}
