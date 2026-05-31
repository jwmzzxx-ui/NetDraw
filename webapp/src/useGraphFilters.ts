import { useMemo, useState } from "react";
import type { PositionedGraph } from "../../src/types.js";
import { getAvailableNetTypes, type ViewMode } from "./graphAdapter.js";

export function useGraphFilters(graph: PositionedGraph) {
  const availableNetTypes = useMemo(() => getAvailableNetTypes(graph), [graph]);
  const [activeNetTypes, setActiveNetTypes] = useState<Set<string>>(() => new Set(availableNetTypes));
  const [mode, setMode] = useState<ViewMode>("overview");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const toggleNetType = (netType: string) => {
    setActiveNetTypes((current) => {
      const next = new Set(current);
      if (next.has(netType)) {
        next.delete(netType);
      } else {
        next.add(netType);
      }
      return next;
    });
  };

  return {
    availableNetTypes,
    activeNetTypes,
    mode,
    setMode,
    zoom,
    setZoom,
    highlightedId,
    setHighlightedId,
    toggleNetType
  };
}
