import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { PositionedGraph, Position } from "../../src/types.js";
import { cytoscapeStylesheetFromRules } from "../../src/styleRules.js";
import { buildCytoscapeElements, type GraphViewState } from "./graphAdapter.js";
import { registerElkLayout } from "./useLocalElkLayout.js";

export function useCytoscapeGraph(
  graph: PositionedGraph,
  state: GraphViewState,
  onSelect: (id: string | null) => void,
  onZoomChange?: (zoom: number) => void,
  onNodePositionChange?: (nodeId: string, position: Position) => void
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const previousGraphRef = useRef<PositionedGraph | null>(null);
  const elements = useMemo(() => buildCytoscapeElements(graph, state), [graph, state]);
  const stylesheet = useMemo(() => cytoscapeStylesheetFromRules(undefined, graph.displayRules), [graph.displayRules]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    registerElkLayout();
    const cy = cytoscape({
      container: containerRef.current,
      elements: [...elements.nodes, ...elements.edges],
      layout: { name: "preset", fit: true, padding: 60 },
      style: stylesheet,
      pixelRatio: 1,
      hideEdgesOnViewport: true,
      textureOnViewport: true
    });
    cyRef.current = cy;

    cy.on("tap", "node, edge", (event) => onSelect(event.target.id()));
    cy.on("zoom", () => onZoomChange?.(cy.zoom()));
    cy.on("dragfree", "node", (event) => {
      const position = event.target.position();
      onNodePositionChange?.(event.target.id(), { x: position.x, y: position.y });
    });
    cy.on("tap", (event) => {
      if (event.target === cy) {
        onSelect(null);
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    const graphChanged = previousGraphRef.current !== graph;
    previousGraphRef.current = graph;
    const currentZoom = cy.zoom();
    const currentPan = cy.pan();
    cy.batch(() => {
      cy.elements().remove();
      cy.style(stylesheet);
      cy.add([...elements.nodes, ...elements.edges]);
      cy.layout({ name: "preset", fit: graphChanged, padding: 60 }).run();
      if (!graphChanged) {
        cy.zoom(currentZoom);
        cy.pan(currentPan);
      }
    });
  }, [elements, graph]);

  return { containerRef, cyRef };
}
