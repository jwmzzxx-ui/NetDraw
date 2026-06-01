import type { LayerId } from "./types.js";

export interface CanonicalLayer {
  id: LayerId;
  rank: number;
  key: string;
  label: string;
  aliases: string[];
}

export const CANONICAL_LAYERS: CanonicalLayer[] = [
  { id: "L0", rank: 0, key: "part", label: "部件", aliases: ["part", "component", "部件"] },
  { id: "L1", rank: 1, key: "breakout", label: "分线板/分线器", aliases: ["breakout", "breakout-panel", "splitter", "分线板", "分线器"] },
  { id: "L2", rank: 2, key: "interface-switch-board", label: "接口板/交换板", aliases: ["interface", "io", "switch-board", "接口板", "交换板"] },
  { id: "L3", rank: 3, key: "control-plc-switch", label: "控制板/PLC站/交换机", aliases: ["control", "control-board", "plc", "plc-station", "station", "switch", "控制板", "控制站", "PLC站", "交换机"] },
  { id: "L4", rank: 4, key: "ipc", label: "工控机", aliases: ["ipc", "industrial-pc", "工控机"] }
];

export const CANONICAL_LAYER_IDS = CANONICAL_LAYERS.map((layer) => layer.id);

export function normalizeLayerId(value: string | undefined): LayerId {
  const normalized = value?.trim();
  if (!normalized) {
    return "L0";
  }
  const direct = CANONICAL_LAYERS.find((layer) => layer.id.toLowerCase() === normalized.toLowerCase());
  if (direct) {
    return direct.id;
  }
  const legacyLayerMap: Record<string, LayerId> = {
    l5: "L3",
    l6: "L3",
    l7: "L4"
  };
  const migrated = legacyLayerMap[normalized.toLowerCase()];
  if (migrated) {
    return migrated;
  }
  const byAlias = CANONICAL_LAYERS.find((layer) => layer.aliases.some((alias) => alias.toLowerCase() === normalized.toLowerCase()));
  return byAlias?.id ?? "L0";
}

export function layerLabelFor(layerId: string | undefined): string {
  return CANONICAL_LAYERS.find((layer) => layer.id === layerId)?.label ?? layerId ?? "L0";
}

export function layerKeyFor(layerId: string | undefined): string {
  return CANONICAL_LAYERS.find((layer) => layer.id === layerId)?.key ?? layerId ?? "L0";
}
