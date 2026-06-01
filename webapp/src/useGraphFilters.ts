import { useMemo, useState } from "react";
import type { PositionedGraph } from "../../src/types.js";
import { CANONICAL_LAYER_IDS } from "../../src/layers.js";
import { getAvailableModules, getAvailableNetTypes, type ProjectionMode, type ViewMode } from "./graphAdapter.js";

export function useGraphFilters(graph: PositionedGraph) {
  const availableNetTypes = useMemo(() => getAvailableNetTypes(graph), [graph]);
  const availableModules = useMemo(() => getAvailableModules(graph), [graph]);
  const [activeNetTypes, setActiveNetTypes] = useState<Set<string>>(() => new Set(availableNetTypes));
  const [mode, setMode] = useState<ViewMode>("overview");
  const [projection, setProjection] = useState<ProjectionMode>(graph.rules.projectionDefaults?.mode ?? "layer");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [minVisibleLayer, setMinVisibleLayer] = useState(graph.rules.projectionDefaults?.minVisibleLayer ?? "breakout");
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(() => new Set(CANONICAL_LAYER_IDS));
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
  const toggleLayerId = (layerId: string) => {
    setVisibleLayerIds((current) => {
      const next = new Set(current);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  return {
    availableNetTypes,
    availableModules,
    activeNetTypes,
    mode,
    setMode: (nextMode: ViewMode) => {
      setMode(nextMode);
      if (nextMode === "detail") {
        setProjection("detail");
      } else if (projection === "detail") {
        setProjection("layer");
      }
    },
    projection,
    setProjection: (nextProjection: ProjectionMode) => {
      setProjection(nextProjection);
      setMode(nextProjection === "detail" ? "detail" : "overview");
    },
    activeModule,
    setActiveModule,
    minVisibleLayer,
    setMinVisibleLayer,
    visibleLayerIds,
    toggleLayerId,
    zoom,
    setZoom,
    highlightedId,
    setHighlightedId,
    toggleNetType
  };
}
