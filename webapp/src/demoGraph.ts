import type { PositionedGraph } from "../../src/types.js";

export const demoPositionedGraph: PositionedGraph = {
  rules: {
    layerOrder: ["part", "control", "switch", "ipc", "route"],
    dx: 220,
    dy: 42,
    cabinetGap: 800,
    slotGap: 120,
    boardGap: 28
  },
  warnings: [],
  nodes: [
    node("device:PART_A", "device", "PART_A", 0, 0, "part"),
    node("board:PART_A/CTRL_A", "board", "CTRL_A", 0, 110, "part", "device:PART_A"),
    node("port:PART_A/CTRL_A/LAN1", "port", "LAN1", 0, 190, "part", "board:PART_A/CTRL_A"),
    node("device:CTRL_A", "device", "CTRL_A", 220, 20, "control"),
    node("board:CTRL_A/IO_CARD", "board", "IO_CARD", 220, 130, "control", "device:CTRL_A"),
    node("port:CTRL_A/IO_CARD/AI_01", "port", "AI_01", 220, 220, "control", "board:CTRL_A/IO_CARD"),
    node("device:SW_1", "device", "SW_1", 440, 40, "switch"),
    node("board:SW_1/LINE_CARD", "board", "LINE_CARD", 440, 150, "switch", "device:SW_1"),
    node("port:SW_1/LINE_CARD/GE_01", "port", "GE_01", 440, 240, "switch", "board:SW_1/LINE_CARD"),
    node("route:SPL_A", "route-node", "SPL_A", 130, 350, "route"),
    node("route:PDU_1", "route-node", "PDU_1", 300, 350, "route"),
    node("route:CAB_3", "route-node", "CAB_3", 470, 350, "route")
  ],
  edges: [
    edge("cable:CAB-COMM-001", "logical-cable", "port:PART_A/CTRL_A/LAN1", "port:SW_1/LINE_CARD/GE_01", "CAB-COMM-001", "COMM", "ethernet"),
    edge("cable:CAB-SIG-001", "logical-cable", "port:CTRL_A/IO_CARD/AI_01", "port:PART_A/CTRL_A/LAN1", "CAB-SIG-001", "SIGNAL", "shielded"),
    edge("route-segment:CAB-COMM-001:0", "route-segment", "route:SPL_A", "route:PDU_1", "CAB-COMM-001", "COMM", "ethernet"),
    edge("route-segment:CAB-COMM-001:1", "route-segment", "route:PDU_1", "route:CAB_3", "CAB-COMM-001", "COMM", "ethernet")
  ]
};

function node(
  id: string,
  type: PositionedGraph["nodes"][number]["type"],
  displayName: string,
  x: number,
  y: number,
  layer: string,
  parent?: string
): PositionedGraph["nodes"][number] {
  return {
    id,
    type,
    displayName,
    parent,
    position: { x, y },
    layout: { layer, cabinet: "", slot: "", device: displayName, board: "", order: 0, reason: "demo preset" }
  };
}

function edge(
  id: string,
  type: PositionedGraph["edges"][number]["type"],
  source: string,
  target: string,
  cableId: string,
  netType: "COMM" | "SIGNAL",
  medium: string
): PositionedGraph["edges"][number] {
  return {
    id,
    type,
    source,
    target,
    cableId,
    netType,
    medium,
    routeString: "SPL_A>PDU_1>CAB_3",
    sourceRow: {
      rowId: id,
      srcDevice: "PART_A",
      srcBoard: "CTRL_A",
      srcPort: "LAN1",
      dstDevice: "SW_1",
      dstBoard: "LINE_CARD",
      dstPort: "GE_01",
      netType,
      medium,
      cableId,
      routeHint: "SPL_A>PDU_1>CAB_3"
    }
  };
}
