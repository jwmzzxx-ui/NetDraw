export const NET_TYPES = ["AC", "DC", "COMM", "SIGNAL", "SAFETY"] as const;

export type NetType = (typeof NET_TYPES)[number];

export type LayerId = "L0" | "L1" | "L2" | "L3" | "L4";

export type LegacyLayerType =
  | "part"
  | "breakout"
  | "interface"
  | "control"
  | "switch"
  | "ipc"
  | "route";

export type LayerType = LegacyLayerType | LayerId | string;

export interface InterfaceRow {
  rowId: string;
  srcComponent?: string;
  srcPort: string;
  dstComponent?: string;
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
  srcDevice?: string;
  srcBoard?: string;
  dstDevice?: string;
  dstBoard?: string;
}

export interface NormalizedName {
  originalName: string;
  normalizedName: string;
  displayName: string;
  slug: string;
}

export interface NormalizedInterfaceRow extends InterfaceRow {
  normalized: {
    srcComponent: NormalizedName;
    srcPort: NormalizedName;
    dstComponent: NormalizedName;
    dstPort: NormalizedName;
    srcDevice?: NormalizedName;
    srcBoard?: NormalizedName;
    dstDevice?: NormalizedName;
    dstBoard?: NormalizedName;
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
  componentId?: string;
  componentType: string;
  componentName?: string;
  pdmCode?: string;
  /** @deprecated compatibility input alias for pdmCode */
  componentCode?: string;
  layer?: LayerType;
  layerId?: LayerId;
  layerName?: string;
  module?: string;
  cabinet?: string;
  slot?: string;
  order?: string;
  displayName?: string;
  ports?: GraphPort[];
  templateId?: string;
  templateVariant?: string;
  templateParams?: string;
  remarks?: string;
  nodeId?: string;
}

export interface GraphPort {
  portId: string;
  connectorName?: string;
  displayName?: string;
  normalizedName?: string;
  side?: TemplateAnchorSide;
  offset?: number;
  x?: number;
  y?: number;
  metadata?: Record<string, string | undefined>;
}

export interface GraphNode {
  id: string;
  type: "component" | "route-node" | "device" | "board" | "port";
  layer?: LayerType;
  displayName: string;
  componentId?: string;
  componentName?: string;
  pdmCode?: string;
  /** @deprecated compatibility input alias for pdmCode */
  componentCode?: string;
  layerId?: LayerId;
  layerName?: string;
  module?: string;
  cabinet?: string;
  slot?: string;
  order?: string;
  ports?: GraphPort[];
  metadata?: Record<string, string | undefined>;
  parent?: string;
}

export interface GraphEdge {
  id: string;
  type: "logical-cable" | "route-segment";
  source: string;
  target: string;
  sourcePortId?: string;
  targetPortId?: string;
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
  sourceComponent?: GraphNode;
  targetComponent?: GraphNode;
  sourcePort?: GraphPort;
  targetPort?: GraphPort;
  routeSegments: GraphEdge[];
  routeNodeIds: string[];
}

export interface CableListRow {
  cableId: string;
  netType: string;
  medium: string;
  cableType: string;
  srcComponent: string;
  srcPort: string;
  dstComponent: string;
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

export type TemplateShape = "round-rectangle" | "rectangle" | "hexagon" | "ellipse";
export type TemplateAnchorSide = "left" | "right" | "top" | "bottom" | "center";

export interface TemplatePort {
  id: string;
  connectorName?: string;
  label?: string;
  side: TemplateAnchorSide;
  offset: number;
  x?: number;
  y?: number;
  boxWidth?: number;
  boxHeight?: number;
  idLabel?: TemplatePortLabel;
  connectorLabel?: TemplatePortLabel;
}

export type TemplateAnchor = TemplatePort;

export interface TemplateTextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bind: string;
  fallback?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
}

export interface TemplatePortLabel {
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  align?: "left" | "center" | "right";
  snapSide?: TemplateAnchorSide | "free";
}

export interface DisplayTemplate {
  id: string;
  label: string;
  width: number;
  height: number;
  shape: TemplateShape;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  titleFill?: string;
  titleColor?: string;
  titleHeight?: number;
  labelPosition?: "center" | "title" | "below";
  ports?: TemplatePort[];
  textBoxes?: TemplateTextBox[];
  anchors?: TemplateAnchor[];
}

export interface DisplayTemplateOverride {
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  titleFill?: string;
  titleColor?: string;
  titleHeight?: number;
  label?: string;
  ports?: TemplatePort[];
  textBoxes?: TemplateTextBox[];
  anchors?: TemplateAnchor[];
}

export interface CableTemplate {
  id: string;
  label: string;
  stroke: string;
  strokeWidth: number;
  lineStyle?: "solid" | "dashed";
  endpointLabels?: {
    sourcePort: TemplateTextBox;
    targetPort: TemplateTextBox;
  };
  cableLabel?: TemplateTextBox;
  textBoxes?: TemplateTextBox[];
}

export interface DisplayRules {
  templates: Record<string, DisplayTemplate>;
  cableTemplates?: Record<string, CableTemplate>;
  pdmCodeTemplates?: Record<string, string>;
  nodeTemplates?: Record<string, string>;
  kindTemplates?: Partial<Record<GraphNode["type"], string>>;
  cableKindTemplates?: Partial<Record<GraphEdge["type"], string>>;
  edgeTemplates?: Record<string, string>;
  templateOverrides?: Record<string, DisplayTemplateOverride>;
}

export interface LayoutRules {
  layerOrder: string[];
  dx: number;
  dy: number;
  cabinetGap: number;
  moduleGap?: number;
  slotGap: number;
  boardGap: number;
  moduleOrder?: string[];
  deviceOrder?: string[];
  boardOrder?: string[];
  nodeLayers?: Record<string, string>;
  overridePositions?: Record<string, Position>;
  edgeBendPoints?: Record<string, Position[]>;
  projectionDefaults?: {
    mode: "module" | "layer" | "detail";
    minVisibleLayer: string;
  };
}

export interface PositionedNode extends GraphNode {
  position: Position;
  layout: {
    layer: string;
    layerId?: LayerId;
    layerName?: string;
    module: string;
    cabinet: string;
    slot: string;
    device: string;
    board: string;
    component?: string;
    pdmCode?: string;
    /** @deprecated compatibility alias for pdmCode */
    componentCode?: string;
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
  displayRules?: DisplayRules;
}
