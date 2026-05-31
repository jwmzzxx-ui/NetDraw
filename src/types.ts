export const NET_TYPES = ["AC", "DC", "COMM", "SIGNAL", "SAFETY"] as const;

export type NetType = (typeof NET_TYPES)[number];

export type LayerType =
  | "part"
  | "breakout"
  | "interface"
  | "control"
  | "switch"
  | "ipc"
  | "route";

export interface InterfaceRow {
  rowId: string;
  srcDevice: string;
  srcBoard: string;
  srcPort: string;
  dstDevice: string;
  dstBoard: string;
  dstPort: string;
  netType: NetType;
  medium: string;
  cableId?: string;
  cableType?: string;
  routeHint?: string;
  redundancyGroup?: string;
  direction?: string;
  remarks?: string;
  rawRecord?: Record<string, string | undefined>;
}

export interface NormalizedName {
  originalName: string;
  normalizedName: string;
  displayName: string;
  slug: string;
}

export interface NormalizedInterfaceRow extends InterfaceRow {
  normalized: {
    srcDevice: NormalizedName;
    srcBoard: NormalizedName;
    srcPort: NormalizedName;
    dstDevice: NormalizedName;
    dstBoard: NormalizedName;
    dstPort: NormalizedName;
  };
}

export interface NormalizationLog {
  code: "ALIAS_APPLIED" | "DISPLAY_NAME_CONFLICT";
  severity: "info" | "warning";
  rowId: string;
  field: keyof NormalizedInterfaceRow["normalized"];
  originalName: string;
  normalizedName: string;
  displayName: string;
  message: string;
}

export interface ComponentRow {
  nodeId: string;
  componentType: string;
  layer?: LayerType;
  cabinet?: string;
  slot?: string;
  order?: string;
  displayName?: string;
  remarks?: string;
}

export interface GraphNode {
  id: string;
  type: "device" | "board" | "port" | "route-node";
  parent?: string;
  layer?: LayerType;
  displayName: string;
  metadata?: Record<string, string | undefined>;
}

export interface GraphEdge {
  id: string;
  type: "logical-cable" | "route-segment";
  source: string;
  target: string;
  cableId: string;
  cableType?: string;
  netType: string;
  medium: string;
  routeHint?: string;
  routeAlgorithm?: ResolvedCableRoute["algorithm"];
  routeNodes?: string[];
  routeString?: string;
  segmentIndex?: number;
  sourceRow: InterfaceRow;
}

export interface CanonicalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  indexes?: GraphIndexes;
  diagnostics?: ModelDiagnostic[];
}

export interface GraphIndexes {
  byId: Record<string, GraphIndexEntry>;
  byCableId: Record<string, CableEdgeIndex>;
  byParent: Record<string, string[]>;
}

export interface GraphIndexEntry {
  kind: "node" | "edge";
  index: number;
}

export interface CableEdgeIndex {
  logicalCableEdgeIds: string[];
  routeSegmentEdgeIds: string[];
}

export interface ModelDiagnostic {
  code: "DUPLICATE_ID" | "MISSING_PARENT" | "MISSING_EDGE_ENDPOINT" | "ROUTE_CHAIN_MISMATCH" | "UNKNOWN_COMPONENT_NODE";
  severity: "error" | "warning" | "info";
  message: string;
  nodeId?: string;
  edgeId?: string;
  cableId?: string;
}

export interface CableTrace {
  cableId: string;
  logicalCable: GraphEdge;
  sourcePort?: GraphNode;
  targetPort?: GraphNode;
  routeSegments: GraphEdge[];
  routeNodeIds: string[];
}

export interface CableListRow {
  cableId: string;
  netType: string;
  medium: string;
  cableType: string;
  srcDevice: string;
  srcBoard: string;
  srcPort: string;
  dstDevice: string;
  dstBoard: string;
  dstPort: string;
  routeNodes: string;
  routeString: string;
  redundancyGroup: string;
  direction: string;
  remarks: string;
}

export interface ExportConfig {
  fileBaseName?: string;
  csvFileName?: string;
  xlsxFileName?: string;
}

export interface ValidationIssue {
  code:
    | "DUPLICATE_CABLE_ID"
    | "UNSUPPORTED_NET_TYPE"
    | "MISSING_ENDPOINT"
    | "DUPLICATE_ROW_ID"
    | "EMPTY_CABLE_ID";
  rowId?: string;
  cableId?: string;
  severity: "error" | "warning" | "suggestion";
  message: string;
}

export interface PipelineSummary {
  inputPath: string;
  outDir: string;
  rowCount: number;
  nodeCount: number;
  edgeCount: number;
  logicalCableCount: number;
  routeSegmentCount: number;
  cableCount: number;
  normalizationLogCount: number;
  validationIssueCount: number;
  modelDiagnosticCount: number;
  analysisIssueCount: number;
}

export interface RouteResourceEdge {
  fromRouteNode: string;
  toRouteNode: string;
  cost: number;
  zone?: string;
  capacity?: number;
  fromPosition?: Position;
  toPosition?: Position;
}

export interface RouteSegment {
  source: string;
  target: string;
  cost: number;
}

export interface ResolvedCableRoute {
  cableId: string;
  algorithm: "explicit" | "dijkstra" | "astar";
  routeNodes: string[];
  routeSegments: RouteSegment[];
  routeString: string;
}

export type AnalysisSeverity = "error" | "warning" | "info";

export interface AnalysisIssue {
  code:
    | "DIRECTED_CYCLE"
    | "PARALLEL_EDGES"
    | "REDUNDANCY_GROUP_SINGLE_MEMBER"
    | "REDUNDANCY_GROUP_MIXED_NET_TYPES"
    | "ISOLATED_PORT"
    | "UNDEFINED_ROUTE_NODE";
  severity: AnalysisSeverity;
  message: string;
  edgeIds?: string[];
  nodeId?: string;
  groupId?: string;
}

export interface ParallelEdgeGroup {
  source: string;
  target: string;
  edgeIds: string[];
}

export interface RedundancyGroupReport {
  groupId: string;
  edgeIds: string[];
  netTypes: string[];
}

export interface VisualSuggestions {
  summaryEdgeIds: string[];
  detailEdgeIds: string[];
}

export interface AnalysisReport {
  issues: AnalysisIssue[];
  stronglyConnectedComponents: string[][];
  parallelEdgeGroups: ParallelEdgeGroup[];
  redundancyGroups: RedundancyGroupReport[];
  visualSuggestions: VisualSuggestions;
}

export interface Position {
  x: number;
  y: number;
}

export interface LayoutRules {
  layerOrder: string[];
  dx: number;
  dy: number;
  cabinetGap: number;
  slotGap: number;
  boardGap: number;
  deviceOrder?: string[];
  boardOrder?: string[];
  nodeLayers?: Record<string, string>;
  overridePositions?: Record<string, Position>;
  edgeBendPoints?: Record<string, Position[]>;
}

export interface PositionedNode extends GraphNode {
  position: Position;
  layout: {
    layer: string;
    cabinet: string;
    slot: string;
    device: string;
    board: string;
    order: number;
    reason: string;
  };
}

export interface LayoutWarning {
  code: "POSITION_COLLISION";
  nodeId: string;
  originalPosition: Position;
  adjustedPosition: Position;
  message: string;
}

export interface PositionedGraph {
  nodes: PositionedNode[];
  edges: GraphEdge[];
  warnings: LayoutWarning[];
  rules: LayoutRules;
}
