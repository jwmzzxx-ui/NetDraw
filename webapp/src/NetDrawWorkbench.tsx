import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Cable, Download, Eye, Filter, Gauge, GitBranch, Layers3, Search, TriangleAlert, Upload } from "lucide-react";
import { buildTemplateBackgroundDataUri, DEFAULT_DISPLAY_RULES, mergeDisplayRules, resolveCableTemplate, resolveDisplayTemplate } from "../../src/displayRules.js";
import { CANONICAL_LAYERS } from "../../src/layers.js";
import type { CableTemplate, DisplayRules, DisplayTemplate, DisplayTemplateOverride, GraphEdge, GraphNode, PositionedGraph, Position, TemplatePort, TemplatePortLabel, TemplateShape, TemplateTextBox } from "../../src/types.js";
import type { ImportUploadFiles } from "./apiClient.js";
import { createBenchmarkMetrics, formatMs } from "./benchmark.js";
import { getGraphStats } from "./graphAdapter.js";
import {
  applyOverridePositions,
  formatOverrideRulesPatch,
  updateEdgeBendPoints,
  updateOverridePosition,
  type EdgeBendPoints,
  type OverridePositions
} from "./overrides.js";
import { useCytoscapeGraph } from "./useCytoscapeGraph.js";
import { useGraphFilters } from "./useGraphFilters.js";
import { useLocalElkLayout } from "./useLocalElkLayout.js";

interface NetDrawWorkbenchProps {
  positionedGraph: PositionedGraph;
  onImportData?: (files: ImportUploadFiles) => Promise<void>;
  importSummary?: string;
  importDetails?: string;
  importError?: string | null;
  setImportError?: (message: string | null) => void;
  projectName?: string;
  userName?: string;
  onBackToProjects?: () => void;
  onLogout?: () => void;
  importHistory?: ImportHistoryItem[];
  activeImportId?: string;
  onSelectImport?: (importId: string) => void;
  artifactDownloads?: ArtifactDownloadItem[];
  templateDownloads?: TemplateDownloadItem[];
}

const netTypeLabels = ["AC", "DC", "COMM", "SIGNAL", "SAFETY"];
type TemplateMode = "layer012" | "handdrawn";
type WorkspaceView = "graph" | "displayTemplates";

interface TemplateNodeSpec {
  kind: "device" | "board" | "port";
  id: string;
  componentType: string;
  layer: "part" | "breakout" | "interface";
  slot: string;
  order: number;
  displayName: string;
  remarks: string;
}

const templateModuleName = "SENSOR-MODULE";
const templateComponentSpecs: TemplateNodeSpec[] = [
  { kind: "device", id: "device:IO_SPIN", componentType: "interface", layer: "interface", slot: "SLOT-02", order: 1, displayName: "IO SPIN", remarks: "level 2 interface board" },
  { kind: "board", id: "board:IO_SPIN/5165113", componentType: "board", layer: "interface", slot: "SLOT-02", order: 2, displayName: "5165113", remarks: "IO SPIN board" },
  { kind: "port", id: "port:IO_SPIN/5165113/IO_H2_10M", componentType: "port", layer: "interface", slot: "SLOT-02", order: 3, displayName: "H2*10M", remarks: "unique port id for H2*10M" },
  { kind: "device", id: "device:IF_SENS", componentType: "breakout", layer: "breakout", slot: "SLOT-01", order: 11, displayName: "IF SENS", remarks: "level 1 breakout board" },
  { kind: "board", id: "board:IF_SENS/5165113", componentType: "board", layer: "breakout", slot: "SLOT-01", order: 12, displayName: "5165113", remarks: "IF SENS board" },
  { kind: "port", id: "port:IF_SENS/5165113/IF_IN_H2_10M", componentType: "port", layer: "breakout", slot: "SLOT-01", order: 13, displayName: "H2*10M", remarks: "input from IO SPIN" },
  { kind: "port", id: "port:IF_SENS/5165113/IF_OUT_PHOTO", componentType: "port", layer: "breakout", slot: "SLOT-01", order: 14, displayName: "H2*2M", remarks: "output to Photo Sensor" },
  { kind: "port", id: "port:IF_SENS/5165113/IF_OUT_LEAK", componentType: "port", layer: "breakout", slot: "SLOT-01", order: 15, displayName: "H2*2M", remarks: "output to Leak Sensor" },
  { kind: "device", id: "device:Photo_Sensor", componentType: "part", layer: "part", slot: "SLOT-03", order: 21, displayName: "Photo Sensor", remarks: "level 0 part" },
  { kind: "board", id: "board:Photo_Sensor/5165113", componentType: "board", layer: "part", slot: "SLOT-03", order: 22, displayName: "5165113", remarks: "Photo Sensor board" },
  { kind: "port", id: "port:Photo_Sensor/5165113/PHOTO_H2_2", componentType: "port", layer: "part", slot: "SLOT-03", order: 23, displayName: "H2*2", remarks: "Photo Sensor connector" },
  { kind: "device", id: "device:Leak_Sensor", componentType: "part", layer: "part", slot: "SLOT-04", order: 31, displayName: "Leak Sensor", remarks: "level 0 part" },
  { kind: "board", id: "board:Leak_Sensor/5165133", componentType: "board", layer: "part", slot: "SLOT-04", order: 32, displayName: "5165133", remarks: "Leak Sensor board" },
  { kind: "port", id: "port:Leak_Sensor/5165133/LEAK_H2_2", componentType: "port", layer: "part", slot: "SLOT-04", order: 33, displayName: "H2*2", remarks: "Leak Sensor connector" }
];

const templateInterfaceRows = [
  ["R001", "IO SPIN", "5165113", "IO_H2_10M", "IF SENS", "5165113", "IF_IN_H2_10M", "SIGNAL", "wire", "5165113-IO-IF", "H2*10M", "", "", "forward", "line=5165113"],
  ["R002", "IF SENS", "5165113", "IF_OUT_PHOTO", "Photo Sensor", "5165113", "PHOTO_H2_2", "SIGNAL", "wire", "5165113-CT85", "H2*2M", "", "", "forward", "5_488_CT85; line=5165113"],
  ["R003", "IF SENS", "5165113", "IF_OUT_LEAK", "Leak Sensor", "5165133", "LEAK_H2_2", "SIGNAL", "wire", "5165323", "H2*2", "", "", "forward", "5_488_CT88"]
];

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  rowCount: number;
  logicalCableCount: number;
}

export interface ArtifactDownloadItem {
  fileName: string;
  kind: string;
  url: string;
}

export interface TemplateDownloadItem {
  fileName: string;
  url: string;
}

export function NetDrawWorkbench({
  positionedGraph,
  onImportData,
  importSummary,
  importDetails,
  importError,
  setImportError,
  projectName,
  userName,
  onBackToProjects,
  onLogout,
  importHistory = [],
  activeImportId,
  onSelectImport,
  artifactDownloads = [],
  templateDownloads = []
}: NetDrawWorkbenchProps) {
  const [overridePositions, setOverridePositions] = useState<OverridePositions>({});
  const [edgeBendPoints, setEdgeBendPoints] = useState<EdgeBendPoints>({});
  const [editableDisplayRules, setEditableDisplayRules] = useState<DisplayRules>(() => mergeDisplayRules(positionedGraph.displayRules));
  const [showOverridePatch, setShowOverridePatch] = useState(false);
  const [showDisplayPatch, setShowDisplayPatch] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showTemplateWizard, setShowTemplateWizard] = useState(false);
  const [templateMode, setTemplateMode] = useState<TemplateMode>("layer012");
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<WorkspaceView>("graph");
  const [selectedDisplayTemplateId, setSelectedDisplayTemplateId] = useState("board-panel");
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplates | null>(null);
  const [interfaceFile, setInterfaceFile] = useState<File | null>(null);
  const [routesFile, setRoutesFile] = useState<File | null>(null);
  const [componentsFile, setComponentsFile] = useState<File | null>(null);
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const interfaceInputId = useId();
  const routesInputId = useId();
  const componentsInputId = useId();
  const rulesInputId = useId();
  useEffect(() => {
    setEditableDisplayRules(mergeDisplayRules(positionedGraph.displayRules));
    setShowDisplayPatch(false);
  }, [positionedGraph]);
  useEffect(() => {
    if (!editableDisplayRules.templates[selectedDisplayTemplateId] && !editableDisplayRules.cableTemplates?.[selectedDisplayTemplateId]) {
      setSelectedDisplayTemplateId(Object.keys(editableDisplayRules.templates)[0] ?? "plain-device");
    }
  }, [editableDisplayRules.templates, editableDisplayRules.cableTemplates, selectedDisplayTemplateId]);
  const renderedGraph = useMemo(() => ({
    ...applyOverridePositions(positionedGraph, overridePositions, edgeBendPoints),
    displayRules: editableDisplayRules
  }), [positionedGraph, overridePositions, edgeBendPoints, editableDisplayRules]);
  const stats = getGraphStats(renderedGraph);
  const benchmark = useMemo(() => {
    const startedAt = performance.now();
    getGraphStats(renderedGraph);
    return createBenchmarkMetrics({ graphBuildTime: performance.now() - startedAt });
  }, [renderedGraph]);
  const filters = useGraphFilters(renderedGraph);
  const graphState = {
    netTypes: filters.activeNetTypes,
    mode: filters.mode,
    projection: filters.projection,
    activeModule: filters.activeModule,
    minVisibleLayer: filters.minVisibleLayer,
    visibleLayerIds: filters.visibleLayerIds,
    highlightedId: filters.highlightedId,
    zoom: filters.zoom
  };
  const { containerRef, cyRef } = useCytoscapeGraph(
    renderedGraph,
    graphState,
    filters.setHighlightedId,
    filters.setZoom,
    (nodeId, position) => setOverridePositions((previous) => updateOverridePosition(previous, nodeId, position))
  );
  const runLocalLayout = useLocalElkLayout(cyRef);
  const selectedEdge = renderedGraph.edges.find((edge) => edge.id === filters.highlightedId);
  const selectedNode = renderedGraph.nodes.find((node) => node.id === filters.highlightedId);
  const overrideCount = Object.keys(overridePositions).length;
  const bentEdgeCount = Object.keys(edgeBendPoints).length;
  const overridePatch = useMemo(() => formatOverrideRulesPatch(overridePositions, edgeBendPoints), [overridePositions, edgeBendPoints]);
  const displayPatch = useMemo(
    () => formatDisplayRulesPatch(overridePositions, edgeBendPoints, editableDisplayRules),
    [overridePositions, edgeBendPoints, editableDisplayRules]
  );
  const moduleOptions = filters.availableModules;
  const selectedTemplate = selectedNode ? resolveDisplayTemplate(selectedNode, editableDisplayRules) : null;
  const selectedCableTemplate = selectedEdge ? resolveCableTemplate(selectedEdge, editableDisplayRules) : null;

  const addBendPoint = () => {
    if (!selectedEdge) {
      return;
    }
    const point = defaultBendPoint(renderedGraph, selectedEdge);
    if (!point) {
      return;
    }
    setEdgeBendPoints((previous) => updateEdgeBendPoints(previous, selectedEdge.id, [...(previous[selectedEdge.id] ?? []), point]));
  };

  const generateTemplates = () => {
    setGeneratedTemplates(buildGeneratedTemplates(templateMode));
  };

  const openTemplateWizard = (mode: TemplateMode) => {
    setTemplateMode(mode);
    setGeneratedTemplates(null);
    setShowTemplateWizard(true);
  };

  const assignNodeTemplate = (node: PositionedGraph["nodes"][number], templateId: string) => {
    const pdmCode = node.pdmCode ?? node.metadata?.pdmCode ?? node.componentCode ?? node.metadata?.componentCode;
    setEditableDisplayRules((current) => ({
      ...current,
      ...(node.type === "component" && pdmCode
        ? {
            pdmCodeTemplates: {
              ...current.pdmCodeTemplates,
              [pdmCode]: templateId
            }
          }
        : {
            nodeTemplates: {
              ...current.nodeTemplates,
              [node.id]: templateId
            }
          })
    }));
    setShowDisplayPatch(false);
  };

  const assignEdgeTemplate = (edgeId: string, templateId: string) => {
    setEditableDisplayRules((current) => ({
      ...current,
      edgeTemplates: {
        ...current.edgeTemplates,
        [edgeId]: templateId
      }
    }));
    setShowDisplayPatch(false);
  };

  const updateTemplate = (templateId: string, patch: Partial<DisplayTemplate>) => {
    setEditableDisplayRules((current) => ({
      ...current,
      templates: {
        ...current.templates,
        [templateId]: {
          ...current.templates[templateId],
          ...patch
        }
      }
    }));
    setShowDisplayPatch(false);
  };

  const updateTemplatePort = (templateId: string, portIndex: number, patch: Partial<TemplatePort>) => {
    const template = editableDisplayRules.templates[templateId];
    if (!template) {
      return;
    }
    const ports = (template.ports ?? template.anchors ?? []).map((port, index) => (index === portIndex ? { ...port, ...patch } : port));
    updateTemplate(templateId, { ports });
  };

  const addTemplatePort = (templateId: string) => {
    const template = editableDisplayRules.templates[templateId];
    const ports = template?.ports ?? template?.anchors ?? [];
    updateTemplate(templateId, { ports: [...ports, { id: `PORT_${ports.length + 1}`, label: `PORT_${ports.length + 1}`, side: "right", offset: 0.5 }] });
  };

  const deleteTemplatePort = (templateId: string, portIndex: number) => {
    const template = editableDisplayRules.templates[templateId];
    const ports = template?.ports ?? template?.anchors ?? [];
    updateTemplate(templateId, { ports: ports.filter((_, index) => index !== portIndex) });
  };

  const updateTemplateTextBox = (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => {
    const template = editableDisplayRules.templates[templateId];
    const boxes = template?.textBoxes ?? [];
    updateTemplate(templateId, { textBoxes: boxes.map((box, index) => (index === boxIndex ? { ...box, ...patch } : box)) });
  };

  const addTemplateTextBox = (templateId: string) => {
    const template = editableDisplayRules.templates[templateId];
    const boxes = template?.textBoxes ?? [];
    updateTemplate(templateId, { textBoxes: [...boxes, { id: `text_${boxes.length + 1}`, x: 10, y: 54, width: 120, height: 16, bind: "displayName", fallback: "", fontSize: 10, color: "#172033", align: "center" }] });
  };

  const deleteTemplateTextBox = (templateId: string, boxIndex: number) => {
    const template = editableDisplayRules.templates[templateId];
    updateTemplate(templateId, { textBoxes: (template?.textBoxes ?? []).filter((_, index) => index !== boxIndex) });
  };

  const updateCableTemplate = (templateId: string, patch: Partial<CableTemplate>) => {
    setEditableDisplayRules((current) => ({
      ...current,
      cableTemplates: {
        ...current.cableTemplates,
        [templateId]: {
          ...current.cableTemplates?.[templateId],
          ...patch
        } as CableTemplate
      }
    }));
    setShowDisplayPatch(false);
  };

  const updateCableTextBox = (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => {
    const template = editableDisplayRules.cableTemplates?.[templateId];
    const boxes = template?.textBoxes ?? [];
    updateCableTemplate(templateId, { textBoxes: boxes.map((box, index) => (index === boxIndex ? { ...box, ...patch } : box)) });
  };

  const addCableTextBox = (templateId: string) => {
    const template = editableDisplayRules.cableTemplates?.[templateId];
    const boxes = template?.textBoxes ?? [];
    updateCableTemplate(templateId, { textBoxes: [...boxes, { id: `cable_text_${boxes.length + 1}`, x: 0, y: -14, width: 90, height: 16, bind: "cableId", fallback: "", fontSize: 10, color: "#334155", align: "center" }] });
  };

  const deleteCableTextBox = (templateId: string, boxIndex: number) => {
    const template = editableDisplayRules.cableTemplates?.[templateId];
    updateCableTemplate(templateId, { textBoxes: (template?.textBoxes ?? []).filter((_, index) => index !== boxIndex) });
  };

  const submitImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!interfaceFile || !onImportData) {
      setImportError?.("Interface table is required.");
      return;
    }
    setImportBusy(true);
    try {
      await onImportData({
        interfaceTable: interfaceFile,
        routesTable: routesFile,
        componentsTable: componentsFile,
        rulesJson: rulesFile
      });
      setImportError?.(null);
      setShowImportPanel(false);
      setInterfaceFile(null);
      setRoutesFile(null);
      setComponentsFile(null);
      setRulesFile(null);
    } catch (error) {
      setImportError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <main className="workbench">
      <header className="topbar">
        <div className="brand">
          <GitBranch size={20} aria-hidden="true" />
          <div>
            <h1>NetDraw</h1>
            <span>{projectName ? `Project: ${projectName}` : "Physical network graph workbench"}</span>
          </div>
        </div>
        <div className="mode-switch workspace-switch" aria-label="Workspace view">
          <button type="button" aria-pressed={activeWorkspaceView === "graph"} onClick={() => setActiveWorkspaceView("graph")}>
            <Eye size={15} aria-hidden="true" />
            图纸视图
          </button>
          <button type="button" aria-pressed={activeWorkspaceView === "displayTemplates"} onClick={() => setActiveWorkspaceView("displayTemplates")}>
            <Layers3 size={15} aria-hidden="true" />
            显示模板
          </button>
        </div>
        <div className="mode-switch" aria-label="View mode">
          <button type="button" aria-pressed={filters.mode === "overview"} onClick={() => filters.setMode("overview")}>
            <Eye size={15} aria-hidden="true" />
            Overview
          </button>
          <button type="button" aria-pressed={filters.mode === "detail"} onClick={() => filters.setMode("detail")}>
            <Layers3 size={15} aria-hidden="true" />
            Detail
          </button>
        </div>
        <div className="mode-switch projection-switch" aria-label="Projection mode">
          <button type="button" aria-pressed={filters.projection === "module"} onClick={() => filters.setProjection("module")}>
            Module
          </button>
          <button type="button" aria-pressed={filters.projection === "layer"} onClick={() => filters.setProjection("layer")}>
            Layer
          </button>
        </div>
        <label className="search">
          <Search size={15} aria-hidden="true" />
          <input placeholder="Search cable, device, port" aria-label="Search cable, device, port" />
        </label>
        <div className="topbar-actions">
          {onImportData ? (
            <button type="button" className="tool-button file-trigger" onClick={() => setShowImportPanel((current) => !current)}>
              <Upload size={15} aria-hidden="true" />
              {showImportPanel ? "Hide import" : "Import data"}
            </button>
          ) : null}
          <button type="button" className="tool-button" onClick={runLocalLayout}>
            <GitBranch size={15} aria-hidden="true" />
            Local ELK
          </button>
          {onBackToProjects ? (
            <button type="button" className="tool-button" onClick={onBackToProjects}>
              Projects
            </button>
          ) : null}
          {onLogout ? (
            <button type="button" className="tool-button" onClick={onLogout}>
              {userName ? `Logout ${userName}` : "Logout"}
            </button>
          ) : null}
        </div>
      </header>

      {activeWorkspaceView === "displayTemplates" ? (
        <DisplayTemplateWorkspace
          displayRules={editableDisplayRules}
          selectedTemplateId={selectedDisplayTemplateId}
          displayPatch={displayPatch}
          showDisplayPatch={showDisplayPatch}
          onSelectTemplate={setSelectedDisplayTemplateId}
          onUpdateTemplate={updateTemplate}
          onUpdatePort={updateTemplatePort}
          onAddPort={addTemplatePort}
          onDeletePort={deleteTemplatePort}
          onUpdateTextBox={updateTemplateTextBox}
          onAddTextBox={addTemplateTextBox}
          onDeleteTextBox={deleteTemplateTextBox}
          onUpdateCableTemplate={updateCableTemplate}
          onUpdateCableTextBox={updateCableTextBox}
          onAddCableTextBox={addCableTextBox}
          onDeleteCableTextBox={deleteCableTextBox}
          onShowDisplayPatch={() => setShowDisplayPatch(true)}
        />
      ) : (
      <section className="workspace">
        <aside className="sidebar">
          {onImportData ? (
            <section className="panel import-panel">
              <h2>
                <Upload size={15} aria-hidden="true" />
                Data import
              </h2>
              <p className="active-count">Import from this panel. Main sample mapping: interfaces-1200.csv to Interface table, routes-1200.csv to Routes table, components-1200.csv to Components table, rules-1200.json to Rules file.</p>
              <button type="button" className="tool-button panel-action" onClick={() => setShowImportPanel((current) => !current)}>
                <Upload size={15} aria-hidden="true" />
                {showImportPanel ? "Hide import form" : "Open import form"}
              </button>
              {showImportPanel ? (
                <form className="import-form" onSubmit={submitImport}>
                  <FilePickField
                    inputId={interfaceInputId}
                    label="Interface table"
                    hint="Required, .csv / .xlsx / .xls"
                    accept=".csv,.xlsx,.xls"
                    file={interfaceFile}
                    onChange={setInterfaceFile}
                  />
                  <FilePickField
                    inputId={routesInputId}
                    label="Routes table"
                    hint="Optional, .csv"
                    accept=".csv"
                    file={routesFile}
                    onChange={setRoutesFile}
                  />
                  <FilePickField
                    inputId={componentsInputId}
                    label="Components table"
                    hint="Optional, .csv / .xlsx / .xls"
                    accept=".csv,.xlsx,.xls"
                    file={componentsFile}
                    onChange={setComponentsFile}
                  />
                  <FilePickField
                    inputId={rulesInputId}
                    label="Rules file"
                    hint="Optional, .json"
                    accept=".json"
                    file={rulesFile}
                    onChange={setRulesFile}
                  />
                  <button type="submit" className="primary-button" disabled={importBusy || !interfaceFile}>
                    {importBusy ? "Importing..." : "Start import"}
                  </button>
                </form>
              ) : null}
              {templateDownloads.length > 0 ? (
                <div className="download-list">
                  {templateDownloads.map((template) => (
                    <a key={template.fileName} className="download-link" href={template.url}>
                      Template: {template.fileName}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="panel">
            <h2>
              <Filter size={15} aria-hidden="true" />
              Network filters
            </h2>
            <label className="select-row">
              Module subgraph
              <select aria-label="Module subgraph" value={filters.activeModule ?? ""} onChange={(event) => filters.setActiveModule(event.target.value || null)}>
                <option value="">All modules</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-list">
              {netTypeLabels.map((netType) => (
                <label key={netType} className="check-row">
                  <input type="checkbox" checked={filters.activeNetTypes.has(netType)} onChange={() => filters.toggleNetType(netType)} />
                  <span className={`swatch swatch-${netType.toLowerCase()}`} />
                  {netType}
                </label>
              ))}
            </div>
            <p className="active-count">{filters.activeNetTypes.size} active cable types</p>
            <div className="layer-filter-list" aria-label="Visible drawing layers">
              {CANONICAL_LAYERS.map((layer) => (
                <label key={layer.id} className="check-row">
                  <input
                    type="checkbox"
                    aria-label={`Layer ${layer.id}`}
                    checked={filters.visibleLayerIds.has(layer.id)}
                    onChange={() => filters.toggleLayerId(layer.id)}
                  />
                  <span className="layer-pill">{layer.id}</span>
                  {layer.label}
                </label>
              ))}
            </div>
          </section>

          <section className="panel template-panel">
            <h2>
              <Layers3 size={15} aria-hidden="true" />
              绘制模板
            </h2>
            <div className="template-entry-list">
              <button
                type="button"
                className="tool-button panel-action"
                aria-pressed={showTemplateWizard && templateMode === "layer012"}
                onClick={() => openTemplateWizard("layer012")}
              >
                <Layers3 size={15} aria-hidden="true" />
                0/1/2层模板
              </button>
              <button
                type="button"
                className="tool-button panel-action"
                aria-pressed={showTemplateWizard && templateMode === "handdrawn"}
                onClick={() => openTemplateWizard("handdrawn")}
              >
                <GitBranch size={15} aria-hidden="true" />
                手绘模板
              </button>
            </div>
            {showTemplateWizard ? (
              <div className="template-wizard">
                <p className="active-count">{templateMode === "handdrawn" ? "手绘模板会输出固定坐标和显示模板规则。" : "0/1/2层模板会输出部件、分线板、接口板三层数据。"}</p>
                <button type="button" className="primary-button" onClick={generateTemplates}>
                  Generate templates
                </button>
                {generatedTemplates ? (
                  <div className="generated-template-list">
                    <textarea aria-label="Generated interface template" readOnly value={generatedTemplates.interfaceCsv} />
                    <textarea aria-label="Generated components template" readOnly value={generatedTemplates.componentsCsv} />
                    <textarea aria-label="Generated rules template" readOnly value={generatedTemplates.rulesJson} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel metrics">
            <h2>
              <Cable size={15} aria-hidden="true" />
              Graph stats
            </h2>
            {importSummary ? <p className="active-count">{importSummary}</p> : null}
            {importDetails ? <p className="active-count">{importDetails}</p> : null}
            {importError ? <p className="import-error">{importError}</p> : null}
            <dl>
              <div>
                <dt>Nodes</dt>
                <dd>{stats.nodes}</dd>
              </div>
              <div>
                <dt>Logical cables</dt>
                <dd>{stats.logicalCables}</dd>
              </div>
              <div>
                <dt>Route segments</dt>
                <dd>{stats.routeSegments}</dd>
              </div>
              <div>
                <dt>Layout warnings</dt>
                <dd>{stats.warnings}</dd>
              </div>
            </dl>
          </section>

          {importHistory.length > 0 ? (
            <section className="panel import-history-panel">
              <h2>
                <Upload size={15} aria-hidden="true" />
                Import history
              </h2>
              <div className="import-history-list">
                {importHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="history-item"
                    aria-pressed={item.id === activeImportId}
                    onClick={() => onSelectImport?.(item.id)}
                  >
                    <span>{item.fileName}</span>
                    <small>{item.status} · {item.rowCount} rows · {item.logicalCableCount} cables</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {artifactDownloads.length > 0 ? (
            <section className="panel import-history-panel">
              <h2>
                <Download size={15} aria-hidden="true" />
                Downloads
              </h2>
              <div className="download-list">
                {artifactDownloads.map((artifact) => (
                  <a key={artifact.fileName} className="download-link" href={artifact.url}>
                    {artifact.fileName}
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel metrics benchmark">
            <h2>
              <Gauge size={15} aria-hidden="true" />
              Benchmark
            </h2>
            <dl>
              <div>
                <dt>Parse time</dt>
                <dd>{formatMs(benchmark.parseTime)}</dd>
              </div>
              <div>
                <dt>Graph build time</dt>
                <dd>{formatMs(benchmark.graphBuildTime)}</dd>
              </div>
              <div>
                <dt>Render init time</dt>
                <dd>{formatMs(benchmark.renderInitTime)}</dd>
              </div>
              <div>
                <dt>Expand detail time</dt>
                <dd>{formatMs(benchmark.expandDetailTime)}</dd>
              </div>
              <div>
                <dt>Export time</dt>
                <dd>{formatMs(benchmark.exportTime)}</dd>
              </div>
            </dl>
          </section>

          <section className="panel override-panel">
            <h2>
              <Download size={15} aria-hidden="true" />
              Manual overrides
            </h2>
            <p className="active-count">{overrideCount === 1 ? "1 moved node" : `${overrideCount} moved nodes`}</p>
            <p className="active-count">{bentEdgeCount === 1 ? "1 bent edge" : `${bentEdgeCount} bent edges`}</p>
            <button
              type="button"
              className="tool-button panel-action"
              disabled={overrideCount + bentEdgeCount === 0}
              onClick={() => setShowOverridePatch(true)}
            >
              <Download size={15} aria-hidden="true" />
              Export overrides
            </button>
            {showOverridePatch ? (
              <textarea className="override-output" aria-label="Rules override JSON" readOnly value={overridePatch} />
            ) : null}
          </section>
        </aside>

        <section className="canvas-shell">
          <div className="canvas-header">
            <span>{projectionLabel(filters.projection)}</span>
            <span>{filters.activeModule ? `Module: ${filters.activeModule}` : "All modules"}</span>
          </div>
          <div ref={containerRef} className="graph-canvas" aria-label="NetDraw Cytoscape graph canvas" />
        </section>

        <aside className="inspector">
          <h2>Inspector</h2>
          {selectedEdge ? (
            <div className="inspector-body">
              <span className="object-type">{selectedEdge.type}</span>
              <h3>{selectedEdge.cableId}</h3>
              <dl>
                <div>
                  <dt>Network</dt>
                  <dd>{selectedEdge.netType}</dd>
                </div>
                <div>
                  <dt>Medium</dt>
                  <dd>{selectedEdge.medium}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>{selectedEdge.routeString ?? selectedEdge.routeHint ?? "None"}</dd>
                </div>
              </dl>
              <button type="button" className="tool-button panel-action" onClick={addBendPoint}>
                <GitBranch size={15} aria-hidden="true" />
                Add bend point
              </button>
              {selectedCableTemplate ? (
                <section className="template-summary">
                  <span className="object-type">Cable template</span>
                  <label className="select-row">
                    Template
                    <select
                      aria-label="Cable display template"
                      value={selectedCableTemplate.templateId}
                      onChange={(event) => assignEdgeTemplate(selectedEdge.id, event.target.value)}
                    >
                      {Object.values(editableDisplayRules.cableTemplates ?? {}).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              ) : null}
            </div>
          ) : selectedNode ? (
            <div className="inspector-body">
              <span className="object-type">{selectedNode.type}</span>
              <h3>{selectedNode.displayName}</h3>
              {selectedNode.layout.module ? <p>Module: {selectedNode.layout.module}</p> : null}
              <p>{selectedNode.layout.reason}</p>
              {selectedTemplate ? (
                <section className="template-summary">
                  <span className="object-type">Display template</span>
                  <label className="select-row">
                    Template
                    <select
                      aria-label="Node display template"
                      value={selectedTemplate.templateId}
                      onChange={(event) => assignNodeTemplate(selectedNode, event.target.value)}
                    >
                      {Object.values(editableDisplayRules.templates).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="tool-button panel-action"
                    onClick={() => {
                      setSelectedDisplayTemplateId(selectedTemplate.templateId);
                      setActiveWorkspaceView("displayTemplates");
                    }}
                  >
                    <Layers3 size={15} aria-hidden="true" />
                    编辑显示模板
                  </button>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              <TriangleAlert size={18} aria-hidden="true" />
              Select a node or cable to inspect details.
            </div>
          )}
        </aside>
      </section>
      )}
    </main>
  );
}

function DisplayTemplateWorkspace({
  displayRules,
  selectedTemplateId,
  displayPatch,
  showDisplayPatch,
  onSelectTemplate,
  onUpdateTemplate,
  onUpdatePort,
  onAddPort,
  onDeletePort,
  onUpdateTextBox,
  onAddTextBox,
  onDeleteTextBox,
  onUpdateCableTemplate,
  onUpdateCableTextBox,
  onAddCableTextBox,
  onDeleteCableTextBox,
  onShowDisplayPatch
}: {
  displayRules: DisplayRules;
  selectedTemplateId: string;
  displayPatch: string;
  showDisplayPatch: boolean;
  onSelectTemplate: (templateId: string) => void;
  onUpdateTemplate: (templateId: string, patch: Partial<DisplayTemplate>) => void;
  onUpdatePort: (templateId: string, portIndex: number, patch: Partial<TemplatePort>) => void;
  onAddPort: (templateId: string) => void;
  onDeletePort: (templateId: string, portIndex: number) => void;
  onUpdateTextBox: (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => void;
  onAddTextBox: (templateId: string) => void;
  onDeleteTextBox: (templateId: string, boxIndex: number) => void;
  onUpdateCableTemplate: (templateId: string, patch: Partial<CableTemplate>) => void;
  onUpdateCableTextBox: (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => void;
  onAddCableTextBox: (templateId: string) => void;
  onDeleteCableTextBox: (templateId: string, boxIndex: number) => void;
  onShowDisplayPatch: () => void;
}) {
  const templates = Object.values(displayRules.templates);
  const cableTemplates = Object.values(displayRules.cableTemplates ?? {});
  const selectedTemplate = displayRules.templates[selectedTemplateId] ?? templates[0] ?? DEFAULT_DISPLAY_RULES.templates["plain-device"];
  const selectedCableTemplate = displayRules.cableTemplates?.[selectedTemplateId] ?? null;
  const selectedKind = selectedCableTemplate ? "cable" : "node";

  return (
    <section className="display-template-workspace">
      <aside className="template-library-panel">
        <div className="template-page-header">
          <h2>显示模板</h2>
          <span className="active-count">{templates.length + cableTemplates.length} templates</span>
        </div>
        <h3 className="template-library-heading">节点模板</h3>
        <div className="template-library-list">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="template-library-item"
              aria-pressed={template.id === selectedTemplate.id}
              onClick={() => onSelectTemplate(template.id)}
            >
              <span>{template.label}</span>
              <small>{template.id}</small>
            </button>
          ))}
        </div>
        <h3 className="template-library-heading">线缆模板</h3>
        <div className="template-library-list">
          {cableTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="template-library-item"
              aria-pressed={template.id === selectedTemplateId}
              onClick={() => onSelectTemplate(template.id)}
            >
              <span>{template.label}</span>
              <small>{template.id}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="template-properties-panel">
        {selectedKind === "cable" && selectedCableTemplate ? (
          <CableTemplateEditor
            template={selectedCableTemplate}
            onUpdateTemplate={onUpdateCableTemplate}
            onUpdateTextBox={onUpdateCableTextBox}
            onAddTextBox={onAddCableTextBox}
            onDeleteTextBox={onDeleteCableTextBox}
          />
        ) : (
          <NodeTemplateEditor
            template={selectedTemplate}
            onUpdateTemplate={onUpdateTemplate}
            onUpdatePort={onUpdatePort}
            onAddPort={onAddPort}
            onDeletePort={onDeletePort}
            onUpdateTextBox={onUpdateTextBox}
            onAddTextBox={onAddTextBox}
            onDeleteTextBox={onDeleteTextBox}
          />
        )}
      </section>

      <aside className="template-preview-panel">
        <div className="template-page-header">
          <h2>Preview</h2>
          <button type="button" className="tool-button panel-action" onClick={onShowDisplayPatch}>
            <Download size={15} aria-hidden="true" />
            导出显示模板规则
          </button>
        </div>
        {selectedKind === "cable" && selectedCableTemplate ? <CableTemplatePreview template={selectedCableTemplate} /> : <TemplatePreview template={selectedTemplate} />}
        {showDisplayPatch ? <textarea className="override-output" aria-label="Display rules JSON" readOnly value={displayPatch} /> : null}
      </aside>
    </section>
  );
}

function NodeTemplateEditor({
  template,
  onUpdateTemplate,
  onUpdatePort,
  onAddPort,
  onDeletePort,
  onUpdateTextBox,
  onAddTextBox,
  onDeleteTextBox
}: {
  template: DisplayTemplate;
  onUpdateTemplate: (templateId: string, patch: Partial<DisplayTemplate>) => void;
  onUpdatePort: (templateId: string, portIndex: number, patch: Partial<TemplatePort>) => void;
  onAddPort: (templateId: string) => void;
  onDeletePort: (templateId: string, portIndex: number) => void;
  onUpdateTextBox: (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => void;
  onAddTextBox: (templateId: string) => void;
  onDeleteTextBox: (templateId: string, boxIndex: number) => void;
}) {
  const ports = template.ports ?? template.anchors ?? [];
  return (
    <>
      <div className="template-page-header">
        <h2>{template.label}</h2>
        <span className="active-count">{template.id}</span>
      </div>
      <div className="template-form-grid">
        <label>
          Name
          <input aria-label="Template name" value={template.label} onChange={(event) => onUpdateTemplate(template.id, { label: event.target.value })} />
        </label>
        <label>
          Shape
          <select aria-label="Template shape" value={template.shape} onChange={(event) => onUpdateTemplate(template.id, { shape: event.target.value as TemplateShape })}>
            <option value="round-rectangle">round-rectangle</option>
            <option value="rectangle">rectangle</option>
            <option value="hexagon">hexagon</option>
            <option value="ellipse">ellipse</option>
          </select>
        </label>
        <label>
          Width
          <input aria-label="Template width" type="number" min="16" value={template.width} onChange={(event) => onUpdateTemplate(template.id, { width: Number(event.target.value) })} />
        </label>
        <label>
          Height
          <input aria-label="Template height" type="number" min="16" value={template.height} onChange={(event) => onUpdateTemplate(template.id, { height: Number(event.target.value) })} />
        </label>
        <label>
          Fill
          <input aria-label="Template fill" type="color" value={template.fill} onChange={(event) => onUpdateTemplate(template.id, { fill: event.target.value })} />
        </label>
        <label>
          Stroke
          <input aria-label="Template stroke" type="color" value={template.stroke} onChange={(event) => onUpdateTemplate(template.id, { stroke: event.target.value })} />
        </label>
        <label>
          Title height
          <input aria-label="Template title height" type="number" min="0" value={template.titleHeight ?? 0} onChange={(event) => onUpdateTemplate(template.id, { titleHeight: Number(event.target.value) })} />
        </label>
        <label>
          Label position
          <select aria-label="Template label position" value={template.labelPosition ?? "center"} onChange={(event) => onUpdateTemplate(template.id, { labelPosition: event.target.value as DisplayTemplate["labelPosition"] })}>
            <option value="center">center</option>
            <option value="title">title</option>
            <option value="below">below</option>
          </select>
        </label>
      </div>

      <div className="template-anchor-section">
        <div className="template-section-header">
          <h3>Ports</h3>
          <button type="button" className="tool-button panel-action" onClick={() => onAddPort(template.id)}>Add port</button>
        </div>
        <div className="anchor-editor-list">
          {ports.map((port, index) => (
            <div key={`${template.id}-${port.id}-${index}`} className="port-editor-row">
              <input aria-label={`Port ${index + 1} id`} value={port.id} onChange={(event) => onUpdatePort(template.id, index, { id: event.target.value })} />
              <input aria-label={`Port ${index + 1} connector name`} value={port.connectorName ?? port.label ?? ""} onChange={(event) => onUpdatePort(template.id, index, { connectorName: event.target.value })} />
              <input aria-label={`Port ${index + 1} id label x`} type="number" value={port.idLabel?.x ?? 0} onChange={(event) => onUpdatePort(template.id, index, { idLabel: { ...defaultPortLabel(), ...port.idLabel, x: Number(event.target.value) } })} />
              <input aria-label={`Port ${index + 1} id label y`} type="number" value={port.idLabel?.y ?? 0} onChange={(event) => onUpdatePort(template.id, index, { idLabel: { ...defaultPortLabel(), ...port.idLabel, y: Number(event.target.value) } })} />
              <input aria-label={`Port ${index + 1} id label font size`} type="number" min="6" value={port.idLabel?.fontSize ?? 7} onChange={(event) => onUpdatePort(template.id, index, { idLabel: { ...defaultPortLabel(), ...port.idLabel, fontSize: Number(event.target.value) } })} />
              <select aria-label={`Port ${index + 1} id label snap`} value={port.idLabel?.snapSide ?? port.side} onChange={(event) => onUpdatePort(template.id, index, { idLabel: { ...defaultPortLabel(), ...port.idLabel, snapSide: event.target.value as TemplatePort["side"] | "free" } })}>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="center">center</option>
                <option value="free">free</option>
              </select>
              <input aria-label={`Port ${index + 1} connector label x`} type="number" value={port.connectorLabel?.x ?? 0} onChange={(event) => onUpdatePort(template.id, index, { connectorLabel: { ...defaultPortLabel(), ...port.connectorLabel, x: Number(event.target.value) } })} />
              <input aria-label={`Port ${index + 1} connector label y`} type="number" value={port.connectorLabel?.y ?? 0} onChange={(event) => onUpdatePort(template.id, index, { connectorLabel: { ...defaultPortLabel(), ...port.connectorLabel, y: Number(event.target.value) } })} />
              <input aria-label={`Port ${index + 1} connector label font size`} type="number" min="6" value={port.connectorLabel?.fontSize ?? 8} onChange={(event) => onUpdatePort(template.id, index, { connectorLabel: { ...defaultPortLabel(), ...port.connectorLabel, fontSize: Number(event.target.value) } })} />
              <select aria-label={`Port ${index + 1} connector label snap`} value={port.connectorLabel?.snapSide ?? port.side} onChange={(event) => onUpdatePort(template.id, index, { connectorLabel: { ...defaultPortLabel(), ...port.connectorLabel, snapSide: event.target.value as TemplatePort["side"] | "free" } })}>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="center">center</option>
                <option value="free">free</option>
              </select>
              <button type="button" className="tool-button panel-action" onClick={() => onDeletePort(template.id, index)}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      <TextBoxEditor
        boxes={template.textBoxes ?? []}
        title="Text boxes"
        onAdd={() => onAddTextBox(template.id)}
        onDelete={(index) => onDeleteTextBox(template.id, index)}
        onUpdate={(index, patch) => onUpdateTextBox(template.id, index, patch)}
      />
    </>
  );
}

function CableTemplateEditor({
  template,
  onUpdateTemplate,
  onUpdateTextBox,
  onAddTextBox,
  onDeleteTextBox
}: {
  template: CableTemplate;
  onUpdateTemplate: (templateId: string, patch: Partial<CableTemplate>) => void;
  onUpdateTextBox: (templateId: string, boxIndex: number, patch: Partial<TemplateTextBox>) => void;
  onAddTextBox: (templateId: string) => void;
  onDeleteTextBox: (templateId: string, boxIndex: number) => void;
}) {
  return (
    <>
      <div className="template-page-header">
        <h2>{template.label}</h2>
        <span className="active-count">{template.id}</span>
      </div>
      <div className="template-form-grid">
        <label>
          Name
          <input aria-label="Cable template name" value={template.label} onChange={(event) => onUpdateTemplate(template.id, { label: event.target.value })} />
        </label>
        <label>
          Stroke
          <input aria-label="Cable template stroke" type="color" value={template.stroke} onChange={(event) => onUpdateTemplate(template.id, { stroke: event.target.value })} />
        </label>
        <label>
          Stroke width
          <input aria-label="Cable template stroke width" type="number" min="1" value={template.strokeWidth} onChange={(event) => onUpdateTemplate(template.id, { strokeWidth: Number(event.target.value) })} />
        </label>
        <label>
          Line style
          <select aria-label="Cable template line style" value={template.lineStyle ?? "solid"} onChange={(event) => onUpdateTemplate(template.id, { lineStyle: event.target.value as CableTemplate["lineStyle"] })}>
            <option value="solid">solid</option>
            <option value="dashed">dashed</option>
          </select>
        </label>
      </div>
      <TextBoxEditor
        boxes={template.textBoxes ?? []}
        title="Cable text boxes"
        onAdd={() => onAddTextBox(template.id)}
        onDelete={(index) => onDeleteTextBox(template.id, index)}
        onUpdate={(index, patch) => onUpdateTextBox(template.id, index, patch)}
      />
    </>
  );
}

function TextBoxEditor({
  boxes,
  title,
  onAdd,
  onDelete,
  onUpdate
}: {
  boxes: TemplateTextBox[];
  title: string;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, patch: Partial<TemplateTextBox>) => void;
}) {
  return (
    <div className="template-anchor-section">
      <div className="template-section-header">
        <h3>{title}</h3>
        <button type="button" className="tool-button panel-action" onClick={onAdd}>Add text box</button>
      </div>
      <div className="anchor-editor-list">
        {boxes.map((box, index) => (
          <div key={`${box.id}-${index}`} className="text-box-editor-row">
            <input aria-label={`Text box ${index + 1} id`} value={box.id} onChange={(event) => onUpdate(index, { id: event.target.value })} />
            <input aria-label={`Text box ${index + 1} bind`} value={box.bind} onChange={(event) => onUpdate(index, { bind: event.target.value })} />
            <input aria-label={`Text box ${index + 1} fallback`} value={box.fallback ?? ""} onChange={(event) => onUpdate(index, { fallback: event.target.value })} />
            <input aria-label={`Text box ${index + 1} x`} type="number" value={box.x} onChange={(event) => onUpdate(index, { x: Number(event.target.value) })} />
            <input aria-label={`Text box ${index + 1} y`} type="number" value={box.y} onChange={(event) => onUpdate(index, { y: Number(event.target.value) })} />
            <input aria-label={`Text box ${index + 1} width`} type="number" min="1" value={box.width} onChange={(event) => onUpdate(index, { width: Number(event.target.value) })} />
            <input aria-label={`Text box ${index + 1} height`} type="number" min="1" value={box.height} onChange={(event) => onUpdate(index, { height: Number(event.target.value) })} />
            <select aria-label={`Text box ${index + 1} align`} value={box.align ?? "left"} onChange={(event) => onUpdate(index, { align: event.target.value as TemplateTextBox["align"] })}>
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
            <button type="button" className="tool-button panel-action" onClick={() => onDelete(index)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatePreview({ template }: { template: DisplayTemplate }) {
  const backgroundUri = buildTemplateBackgroundDataUri(template, undefined, { textBoxPlaceholder: "bind" });
  return (
    <div className="template-preview-stage">
      <div
        className="template-preview-render"
        style={{
          width: `${template.width}px`,
          height: `${template.height}px`,
          backgroundImage: `url("${backgroundUri}")`
        }}
      />
    </div>
  );
}

function CableTemplatePreview({ template }: { template: CableTemplate }) {
  const fixedLabels = [
    { box: template.endpointLabels?.sourcePort, value: "SRC_PORT" },
    { box: template.endpointLabels?.targetPort, value: "DST_PORT" },
    { box: template.cableLabel, value: "CABLE_ID" }
  ].filter((item): item is { box: TemplateTextBox; value: string } => Boolean(item.box));
  return (
    <div className="template-preview-stage">
      <div className="cable-template-preview">
        <svg width="320" height="120" viewBox="0 0 320 120" role="img" aria-label="Cable template preview">
          <line x1="28" y1="62" x2="292" y2="62" stroke={template.stroke} strokeWidth={template.strokeWidth} strokeDasharray={template.lineStyle === "dashed" ? "8 6" : undefined} strokeLinecap="round" />
          <rect x="18" y="52" width="42" height="20" fill="#ffffff" stroke={template.stroke} />
          <rect x="260" y="52" width="42" height="20" fill="#ffffff" stroke={template.stroke} />
        </svg>
        {fixedLabels.map((item) => (
          <span key={item.box.id} className="template-preview-textbox cable-preview-textbox" style={{ ...textBoxPreviewStyle(item.box), left: `calc(50% + ${item.box.x - item.box.width / 2}px)`, top: `calc(50% + ${item.box.y}px)` }}>
            {item.value}
          </span>
        ))}
        {(template.textBoxes ?? []).map((box, index) => (
          <span key={`${box.id}-${index}`} className="template-preview-textbox cable-preview-textbox" style={{ ...textBoxPreviewStyle(box), left: `calc(50% + ${box.x - box.width / 2}px)`, top: `calc(50% + ${box.y}px)` }}>
            {box.bind || box.fallback || box.id}
          </span>
        ))}
      </div>
    </div>
  );
}

function anchorPreviewStyle(port: TemplatePort): Record<string, string> {
  const pct = `${Math.max(0, Math.min(1, port.offset)) * 100}%`;
  if (port.side === "left") {
    return { left: "-5px", top: pct };
  }
  if (port.side === "right") {
    return { right: "-5px", top: pct };
  }
  if (port.side === "top") {
    return { left: pct, top: "-5px" };
  }
  if (port.side === "bottom") {
    return { left: pct, bottom: "-5px" };
  }
  return { left: "50%", top: "50%" };
}

function textBoxPreviewStyle(box: TemplateTextBox): Record<string, string> {
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    color: box.color ?? "#172033",
    fontSize: `${box.fontSize ?? 10}px`,
    textAlign: box.align ?? "left"
  };
}

function defaultPortLabel() {
  return { x: 0, y: 0, fontSize: 8, color: "#172033", align: "center" as const, snapSide: "free" as const };
}

function portLabelPreviewStyle(anchorStyle: Record<string, string>, label: TemplatePortLabel): Record<string, string> {
  const left = anchorStyle.left ?? (anchorStyle.right ? `calc(100% - ${anchorStyle.right})` : "50%");
  const top = anchorStyle.top ?? (anchorStyle.bottom ? `calc(100% - ${anchorStyle.bottom})` : "50%");
  return {
    left,
    top,
    transform: `translate(calc(-50% + ${label.x}px), calc(-50% + ${label.y}px))`,
    fontSize: `${label.fontSize}px`,
    color: label.color ?? "#172033",
    textAlign: label.align ?? "center"
  };
}

interface GeneratedTemplates {
  interfaceCsv: string;
  componentsCsv: string;
  rulesJson: string;
}

function buildGeneratedTemplates(mode: TemplateMode): GeneratedTemplates {
  const interfaceRows = [
    "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id,cable_type,route_hint,redundancy_group,direction,remarks",
    ...templateInterfaceRows.map(formatCsvRow)
  ];
  const componentsRows = [
    "node_id,type,layer_id,layer_name,module,cabinet,slot,order,display_name,template_id,template_variant,template_params,remarks",
    ...templateComponentSpecs.map((item) =>
      formatCsvRow([
        item.id,
        item.componentType,
        generatedLayerId(item.layer),
        generatedLayerName(item.layer),
        templateModuleName,
        "SENS-CAB",
        item.slot,
        String(item.order),
        item.displayName,
        templateIdForGeneratedSpec(item),
        "",
        templateParamsForGeneratedSpec(item),
        item.remarks
      ])
    )
  ];
  const rules = buildTemplateRules(mode);

  return {
    interfaceCsv: `${interfaceRows.join("\n")}\n`,
    componentsCsv: `${componentsRows.join("\n")}\n`,
    rulesJson: `${JSON.stringify(rules, null, 2)}\n`
  };
}

function buildTemplateRules(mode: TemplateMode) {
  const baseRules = {
    layout: {
      layerOrder: ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "route"],
      moduleOrder: [templateModuleName],
      moduleGap: 700,
      dx: 300,
      dy: 28,
      cabinetGap: 900,
      slotGap: 120,
      boardGap: 24,
      projectionDefaults: { mode: "layer", minVisibleLayer: "L0" }
    },
    display: {
      templates: DEFAULT_DISPLAY_RULES.templates,
      cableTemplates: DEFAULT_DISPLAY_RULES.cableTemplates,
      kindTemplates: DEFAULT_DISPLAY_RULES.kindTemplates,
      cableKindTemplates: DEFAULT_DISPLAY_RULES.cableKindTemplates,
      nodeTemplates: Object.fromEntries(templateComponentSpecs.map((item) => [item.id, templateIdForGeneratedSpec(item)]))
    }
  };

  if (mode === "layer012") {
    return baseRules;
  }

  return {
    layout: {
      ...baseRules.layout,
      overridePositions: {
        "device:IO_SPIN": { x: 0, y: 190 },
        "board:IO_SPIN/5165113": { x: 0, y: 230 },
        "port:IO_SPIN/5165113/IO_H2_10M": { x: 115, y: 250 },
        "device:IF_SENS": { x: 360, y: 190 },
        "board:IF_SENS/5165113": { x: 360, y: 230 },
        "port:IF_SENS/5165113/IF_IN_H2_10M": { x: 245, y: 250 },
        "port:IF_SENS/5165113/IF_OUT_PHOTO": { x: 475, y: 250 },
        "port:IF_SENS/5165113/IF_OUT_LEAK": { x: 475, y: 430 },
        "device:Photo_Sensor": { x: 760, y: 190 },
        "board:Photo_Sensor/5165113": { x: 760, y: 225 },
        "port:Photo_Sensor/5165113/PHOTO_H2_2": { x: 655, y: 250 },
        "device:Leak_Sensor": { x: 760, y: 400 },
        "board:Leak_Sensor/5165133": { x: 760, y: 435 },
        "port:Leak_Sensor/5165133/LEAK_H2_2": { x: 655, y: 430 }
      },
      edgeBendPoints: {
        "cable:5165113-IO-IF": [{ x: 180, y: 250 }],
        "cable:5165113-CT85": [{ x: 565, y: 250 }],
        "cable:5165323": [{ x: 565, y: 430 }]
      }
    },
    display: baseRules.display
  };
}

function templateIdForGeneratedSpec(item: TemplateNodeSpec): string {
  if (item.kind === "port") {
    return "connector-port";
  }
  if (item.displayName === "IF SENS") {
    return "breakout-panel";
  }
  if (item.displayName === "IO SPIN" || item.kind === "board") {
    return "board-panel";
  }
  return "part-sensor";
}

function generatedLayerId(layer: TemplateNodeSpec["layer"]): string {
  if (layer === "interface") {
    return "L2";
  }
  if (layer === "breakout") {
    return "L1";
  }
  return "L0";
}

function generatedLayerName(layer: TemplateNodeSpec["layer"]): string {
  if (layer === "interface") {
    return "接口板";
  }
  if (layer === "breakout") {
    return "分线板";
  }
  return "部件";
}

function templateParamsForGeneratedSpec(item: TemplateNodeSpec): string {
  if (item.kind !== "port") {
    return "";
  }
  const segments = item.id.split("/");
  const portId = segments[segments.length - 1] ?? item.displayName;
  return JSON.stringify({ portId, connectorName: item.displayName });
}

function formatDisplayRulesPatch(positions: OverridePositions, bends: EdgeBendPoints, displayRules: DisplayRules): string {
  return JSON.stringify(
    {
      layout: {
        ...(Object.keys(positions).length > 0 ? { overridePositions: positions } : {}),
        ...(Object.keys(bends).length > 0 ? { edgeBendPoints: bends } : {})
      },
      display: displayRules
    },
    null,
    2
  );
}

function formatCsvRow(values: string[]): string {
  return values.map(formatCsvCell).join(",");
}

function formatCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function projectionLabel(projection: string): string {
  if (projection === "module") {
    return "Module projection";
  }
  if (projection === "detail") {
    return "Detail projection";
  }
  return "Layer projection";
}

function FilePickField({
  inputId,
  label,
  hint,
  accept,
  file,
  onChange
}: {
  inputId: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.files?.[0] ?? null);
  };

  return (
    <div className="file-pick-field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} type="file" accept={accept} aria-label={label} onChange={handleChange} />
      <span className="active-count">{file ? file.name : hint}</span>
    </div>
  );
}

function defaultBendPoint(graph: PositionedGraph, edge: GraphEdge): Position | null {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return null;
  }

  return {
    x: Math.round((source.position.x + target.position.x) / 2),
    y: Math.round((source.position.y + target.position.y) / 2 - 40)
  };
}
