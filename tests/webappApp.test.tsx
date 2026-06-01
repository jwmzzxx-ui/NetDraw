// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NetDrawWorkbench } from "../webapp/src/NetDrawWorkbench.js";
import type { Position } from "../src/types.js";
import type { PositionedGraph } from "../src/types.js";

let emitNodePosition: ((nodeId: string, position: Position) => void) | undefined;
let emitSelect: ((id: string | null) => void) | undefined;
let lastGraph: PositionedGraph | undefined;

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
    lastGraph = _graph;
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
    lastGraph = undefined;
  });

  test("switches between overview and detail mode and filters net types", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    expect(screen.getByText("NetDraw")).toBeTruthy();
    expect(screen.getByText("Overview").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Layer").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Logical cables")).toBeTruthy();
    expect(screen.getByText("Benchmark")).toBeTruthy();
    expect(screen.getByText("Parse time")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Detail" }));
    expect(screen.getByText("Detail").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Module" }));
    expect(screen.getByText("Module").getAttribute("aria-pressed")).toBe("true");

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

  test("shows module subgraph controls from layout metadata", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    expect(screen.getByLabelText("Module subgraph")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Module subgraph"), { target: { value: "MODULE-A" } });
    expect((screen.getByLabelText("Module subgraph") as HTMLSelectElement).value).toBe("MODULE-A");
  });

  test("generates 0/1/2 drawing template files and hand-drawn rules", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    expect(screen.getByRole("button", { name: "手绘模板" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "0/1/2层模板" }));
    expect(screen.getByRole("button", { name: "0/1/2层模板" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Generate templates" }));

    const interfaceOutput = screen.getByLabelText("Generated interface template") as HTMLTextAreaElement;
    const componentsOutput = screen.getByLabelText("Generated components template") as HTMLTextAreaElement;
    const rulesOutput = screen.getByLabelText("Generated rules template") as HTMLTextAreaElement;

    expect(interfaceOutput.value).toContain("IO SPIN");
    expect(interfaceOutput.value).toContain("IF SENS");
    expect(interfaceOutput.value).toContain("Photo Sensor");
    expect(interfaceOutput.value).toContain("Leak Sensor");
    expect(componentsOutput.value).toContain("module");
    expect(componentsOutput.value).toContain("IO_H2_10M");
    expect(componentsOutput.value).toContain("breakout");
    expect(componentsOutput.value).toContain("interface");
    expect(rulesOutput.value).toContain('"layerOrder": [\n      "L0",\n      "L1",\n      "L2",\n      "L3",\n      "L4",\n      "L5",\n      "L6",\n      "L7",\n      "route"\n    ]');
    expect(rulesOutput.value).toContain('"minVisibleLayer": "L0"');

    fireEvent.click(screen.getByRole("button", { name: "手绘模板" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate templates" }));

    expect((screen.getByLabelText("Generated rules template") as HTMLTextAreaElement).value).toContain('"overridePositions"');
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

  test("opens the standalone display template page, edits ports, text boxes, and cable templates", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    fireEvent.click(screen.getByRole("button", { name: "显示模板" }));

    expect(screen.getAllByText("Board panel").length).toBeGreaterThan(0);
    expect(screen.getByText("breakout-panel")).toBeTruthy();
    expect(screen.getByText("default-cable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Part sensor/ }));
    fireEvent.change(screen.getByLabelText("Template width"), { target: { value: "188" } });
    fireEvent.change(screen.getByLabelText("Template fill"), { target: { value: "#ffeecc" } });
    fireEvent.click(screen.getByRole("button", { name: "Add port" }));
    fireEvent.change(screen.getByLabelText("Port 3 id"), { target: { value: "IN_A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add text box" }));
    fireEvent.change(screen.getByLabelText("Text box 1 bind"), { target: { value: "metadata.slot" } });
    expect(document.querySelector(".template-preview-render")?.getAttribute("style")).toContain("IN_A");

    fireEvent.click(screen.getByRole("button", { name: /Default cable/ }));
    fireEvent.change(screen.getByLabelText("Cable template stroke width"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Text box 1 bind"), { target: { value: "sourceRow.remarks" } });
    expect(screen.queryByText("Node assignment")).toBeNull();
    expect(screen.queryByLabelText("Search nodes for template assignment")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "导出显示模板规则" }));

    const patch = screen.getByLabelText("Display rules JSON") as HTMLTextAreaElement;
    expect(patch.value).toContain('"display"');
    expect(patch.value).toContain('"part-sensor"');
    expect(patch.value).toContain('"width": 188');
    expect(patch.value).toContain('"fill": "#ffeecc"');
    expect(patch.value).toContain('"ports"');
    expect(patch.value).toContain('"id": "IN_A"');
    expect(patch.value).toContain('"textBoxes"');
    expect(patch.value).toContain('"bind": "metadata.slot"');
    expect(patch.value).toContain('"cableTemplates"');
    expect(patch.value).toContain('"strokeWidth": 4');
    expect(patch.value).toContain('"bind": "sourceRow.remarks"');

    fireEvent.click(screen.getByRole("button", { name: "图纸视图" }));
    expect(lastGraph?.displayRules?.templates["part-sensor"]).toEqual(expect.objectContaining({ width: 188, fill: "#ffeecc" }));
    expect(lastGraph?.displayRules?.templates["part-sensor"].ports?.some((port) => port.id === "IN_A")).toBe(true);
    expect(lastGraph?.displayRules?.templates["part-sensor"].textBoxes?.some((box) => box.bind === "metadata.slot")).toBe(true);
  });

  test("shows selected node template summary and links to the display template page", () => {
    render(<NetDrawWorkbench positionedGraph={fixtureGraph()} />);

    act(() => {
      emitSelect?.("port:A/BOARD/P1");
    });

    expect(screen.queryByLabelText("Display template")).toBeNull();
    expect(screen.getByRole("button", { name: "编辑显示模板" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑显示模板" }));
    expect(screen.getByRole("button", { name: "显示模板" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("selects node and cable templates from the drawing inspector", () => {
    const graph = fixtureGraph();
    graph.displayRules = {
      templates: {
        ...graph.displayRules?.templates,
        "part-sensor": {
          id: "part-sensor",
          label: "Part sensor",
          width: 190,
          height: 96,
          shape: "round-rectangle",
          fill: "#ffffff",
          stroke: "#737373"
        }
      },
      cableTemplates: {
        "default-cable": {
          id: "default-cable",
          label: "Default cable",
          stroke: "#2563eb",
          strokeWidth: 2
        },
        "thick-cable": {
          id: "thick-cable",
          label: "Thick cable",
          stroke: "#111827",
          strokeWidth: 4
        }
      },
      cableKindTemplates: { "logical-cable": "default-cable" }
    };
    render(<NetDrawWorkbench positionedGraph={graph} />);

    act(() => {
      emitSelect?.("port:A/BOARD/P1");
    });
    fireEvent.change(screen.getByLabelText("Node display template"), { target: { value: "part-sensor" } });
    expect(lastGraph?.displayRules?.nodeTemplates?.["port:A/BOARD/P1"]).toBe("part-sensor");

    act(() => {
      emitSelect?.("cable:C-001");
    });
    fireEvent.change(screen.getByLabelText("Cable display template"), { target: { value: "thick-cable" } });
    expect(lastGraph?.displayRules?.edgeTemplates?.["cable:C-001"]).toBe("thick-cable");
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
