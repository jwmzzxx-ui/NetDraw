import { useCallback } from "react";
import cytoscape from "cytoscape";
import elk from "cytoscape-elk";

let registered = false;

export function registerElkLayout(): void {
  if (!registered) {
    cytoscape.use(elk);
    registered = true;
  }
}

export function useLocalElkLayout(cyRef: React.MutableRefObject<cytoscape.Core | null>) {
  return useCallback(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    registerElkLayout();
    const selected = cy.$(":selected");
    const target = selected.nonempty() ? selected.closedNeighborhood() : cy.elements();
    target
      .layout({
        name: "elk",
        elk: {
          algorithm: "layered",
          "elk.direction": "RIGHT",
          "elk.edgeRouting": "ORTHOGONAL"
        },
        animate: false,
        fit: true,
        padding: 60
      } as cytoscape.LayoutOptions)
      .run();
  }, [cyRef]);
}
