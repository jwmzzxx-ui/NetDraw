// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NetDrawWorkbench } from "../webapp/src/NetDrawWorkbench.js";
import type { Position } from "../src/types.js";
import type { PositionedGraph } from "../src/types.js";

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

describe("NetDrawWorkbench", () => {
  afterEach(() => {
    cleanup();
    emitNodePosition = undefined;
    emitSelect = undefined;
  });

  test("switches between overview and detail mode and filters net types", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    expect(screen.getByText("NetDraw")).toBeTruthy();
    expect(screen.getByText("Overview").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Logical cables")).toBeTruthy();
    expect(screen.getByText("Benchmark")).toBeTruthy();
    expect(screen.getByText("Parse time")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Detail" }));
    expect(screen.getByText("Detail").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByLabelText("COMM"));
    expect(screen.getByText("0 active cable types")).toBeTruthy();
  });

  test("shows the import panel and accepts the required interface file", () => {
    const onImportData = vi.fn().mockResolvedValue(undefined);
    render(
      <NetDrawWorkbench
        positionedGraph={fixtureGraph()}
        onImportData={onImportData}
        templateDownloads={[{ fileName: "interface-template.csv", url: "/api/templates/interface-template.csv" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open import form" }));

    const input = screen.getByLabelText("Interface table") as HTMLInputElement;
    const file = new File(["demo"], "interfaces.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Start import" }));

    expect(onImportData).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceTable: expect.objectContaining({ name: "interfaces.csv" })
      })
    );
    expect(screen.getByText("Template: interface-template.csv")).toBeTruthy();
  });

  test("exports moved node positions as a rules override patch", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    act(() => {
      emitNodePosition?.("port:A/BOARD/P1", { x: 11.4, y: 22.6 });
    });

    expect(screen.getByText("1 moved node")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export overrides" }));

    const patch = screen.getByLabelText("Rules override JSON") as HTMLTextAreaElement;
    expect(patch.value).toContain('"port:A/BOARD/P1"');
    expect(patch.value).toContain('"x": 11');
    expect(patch.value).toContain('"y": 23');
  });

  test("exports selected edge bend points as a rules override patch", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    act(() => {
      emitSelect?.("cable:C-001");
    });
    fireEvent.click(screen.getByRole("button", { name: "Add bend point" }));

    expect(screen.getByText("1 bent edge")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export overrides" }));

    const patch = screen.getByLabelText("Rules override JSON") as HTMLTextAreaElement;
    expect(patch.value).toContain('"edgeBendPoints"');
    expect(patch.value).toContain('"cable:C-001"');
    expect(patch.value).toContain('"x": 100');
    expect(patch.value).toContain('"y": -40');
  });
});

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
        layout: { layer: "part", cabinet: "", slot: "", device: "A", board: "BOARD", order: 0, reason: "test" }
      },
      {
        id: "port:B/BOARD/P2",
        type: "port",
        displayName: "P2",
        position: { x: 200, y: 0 },
        layout: { layer: "control", cabinet: "", slot: "", device: "B", board: "BOARD", order: 0, reason: "test" }
      }
    ],
    edges: [
      {
        id: "cable:C-001",
        type: "logical-cable",
        source: "port:A/BOARD/P1",
        target: "port:B/BOARD/P2",
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
      }
    ]
  };
}
