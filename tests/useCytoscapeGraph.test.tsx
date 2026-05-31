// @vitest-environment jsdom
import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PositionedGraph, Position } from "../src/types.js";
import { useCytoscapeGraph } from "../webapp/src/useCytoscapeGraph.js";

let latestCore: FakeCore | null = null;

vi.mock("cytoscape", () => {
  const factory = vi.fn((options: { layout?: { fit?: boolean } }) => {
    latestCore = new FakeCore(options.layout?.fit ?? false);
    return latestCore;
  });
  return { default: factory };
});

vi.mock("../webapp/src/useLocalElkLayout.js", () => ({
  registerElkLayout: vi.fn()
}));

describe("useCytoscapeGraph", () => {
  afterEach(() => {
    latestCore = null;
  });

  test("preserves viewport zoom when the React zoom state changes", () => {
    const graph = fixtureGraph();
    const { rerender } = render(<Harness graph={graph} zoom={1} />);

    latestCore?.setViewport(2.5, { x: 120, y: 80 });

    rerender(<Harness graph={graph} zoom={2.5} />);

    expect(latestCore?.zoom()).toBe(2.5);
    expect(latestCore?.pan()).toEqual({ x: 120, y: 80 });
  });
});

function Harness({ graph, zoom }: { graph: PositionedGraph; zoom: number }) {
  const { containerRef } = useCytoscapeGraph(
    graph,
    {
      netTypes: new Set(["COMM"]),
      mode: "detail",
      highlightedId: null,
      zoom
    },
    () => undefined
  );

  return <div ref={containerRef} />;
}

class FakeCore {
  private currentZoom = 1;
  private currentPan = { x: 0, y: 0 };

  constructor(fitOnCreate: boolean) {
    if (fitOnCreate) {
      this.currentZoom = 1;
      this.currentPan = { x: 0, y: 0 };
    }
  }

  setViewport(zoom: number, pan: Position) {
    this.currentZoom = zoom;
    this.currentPan = pan;
  }

  on() {
    return this;
  }

  batch(callback: () => void) {
    callback();
  }

  elements() {
    return {
      remove: () => undefined
    };
  }

  add() {
    return undefined;
  }

  layout(options: { fit?: boolean; run?: () => void }) {
    return {
      run: () => {
        if (options.fit) {
          this.currentZoom = 1;
          this.currentPan = { x: 0, y: 0 };
        }
        options.run?.();
      }
    };
  }

  zoom(next?: number) {
    if (typeof next === "number") {
      this.currentZoom = next;
    }
    return this.currentZoom;
  }

  pan(next?: Position) {
    if (next) {
      this.currentPan = next;
    }
    return this.currentPan;
  }

  destroy() {
    return undefined;
  }
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
