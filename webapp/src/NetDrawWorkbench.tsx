import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Cable, Download, Eye, Filter, Gauge, GitBranch, Layers3, Search, TriangleAlert, Upload } from "lucide-react";
import { DEFAULT_DISPLAY_RULES, mergeDisplayRules, resolveDisplayTemplate } from "../../src/displayRules.js";
import type { DisplayRules, DisplayTemplateOverride, GraphEdge, PositionedGraph, Position, TemplateAnchor } from "../../src/types.js";
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

  const assignSelectedTemplate = (templateId: string) => {
    if (!selectedNode) {
      return;
    }
    setEditableDisplayRules((current) => ({
      ...current,
      nodeTemplates: {
        ...current.nodeTemplates,
        [selectedNode.id]: templateId
      }
    }));
    setShowDisplayPatch(false);
  };

  const updateSelectedTemplateOverride = (patch: DisplayTemplateOverride) => {
    if (!selectedNode) {
      return;
    }
    setEditableDisplayRules((current) => ({
      ...current,
      templateOverrides: {
        ...current.templateOverrides,
        [selectedNode.id]: {
          ...current.templateOverrides?.[selectedNode.id],
          ...patch
        }
      }
    }));
    setShowDisplayPatch(false);
  };

  const updateSelectedAnchor = (anchorIndex: number, patch: Partial<TemplateAnchor>) => {
    if (!selectedNode || !selectedTemplate) {
      return;
    }
    const anchors = selectedTemplate.anchors.map((anchor, index) => (index === anchorIndex ? { ...anchor, ...patch } : anchor));
    updateSelectedTemplateOverride({ anchors });
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
          </section>

          <section className="panel template-panel">
            <h2>
              <Layers3 size={15} aria-hidden="true" />
              Drawing templates
            </h2>
            <button type="button" className="tool-button panel-action" onClick={() => setShowTemplateWizard((current) => !current)}>
              <Layers3 size={15} aria-hidden="true" />
              Drawing templates
            </button>
            {showTemplateWizard ? (
              <div className="template-wizard">
                <div className="mode-switch template-mode-switch" aria-label="Template mode">
                  <button
                    type="button"
                    aria-pressed={templateMode === "layer012"}
                    onClick={() => {
                      setTemplateMode("layer012");
                      setGeneratedTemplates(null);
                    }}
                  >
                    0/1/2层模板
                  </button>
                  <button
                    type="button"
                    aria-pressed={templateMode === "handdrawn"}
                    onClick={() => {
                      setTemplateMode("handdrawn");
                      setGeneratedTemplates(null);
                    }}
                  >
                    手绘模板
                  </button>
                </div>
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
            </div>
          ) : selectedNode ? (
            <div className="inspector-body">
              <span className="object-type">{selectedNode.type}</span>
              <h3>{selectedNode.displayName}</h3>
              {selectedNode.layout.module ? <p>Module: {selectedNode.layout.module}</p> : null}
              <p>{selectedNode.layout.reason}</p>
              {selectedTemplate ? (
                <section className="template-editor">
                  <h3>Display template</h3>
                  <label className="select-row">
                    Template
                    <select
                      aria-label="Display template"
                      value={selectedTemplate.templateId}
                      onChange={(event) => assignSelectedTemplate(event.target.value)}
                    >
                      {Object.values(editableDisplayRules.templates).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="template-editor-grid">
                    <label>
                      Width
                      <input
                        aria-label="Template width"
                        type="number"
                        min="16"
                        value={selectedTemplate.width}
                        onChange={(event) => updateSelectedTemplateOverride({ width: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Height
                      <input
                        aria-label="Template height"
                        type="number"
                        min="16"
                        value={selectedTemplate.height}
                        onChange={(event) => updateSelectedTemplateOverride({ height: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Fill
                      <input
                        aria-label="Template fill"
                        type="color"
                        value={selectedTemplate.fill}
                        onChange={(event) => updateSelectedTemplateOverride({ fill: event.target.value })}
                      />
                    </label>
                    <label>
                      Stroke
                      <input
                        aria-label="Template stroke"
                        type="color"
                        value={selectedTemplate.stroke}
                        onChange={(event) => updateSelectedTemplateOverride({ stroke: event.target.value })}
                      />
                    </label>
                  </div>
                  <label className="template-label-field">
                    Label
                    <input
                      aria-label="Template label"
                      value={selectedTemplate.label}
                      onChange={(event) => updateSelectedTemplateOverride({ label: event.target.value })}
                    />
                  </label>
                  {selectedTemplate.anchors.length > 0 ? (
                    <div className="anchor-editor-list">
                      {selectedTemplate.anchors.map((anchor, index) => (
                        <div key={`${anchor.id}-${index}`} className="anchor-editor-row">
                          <input
                            aria-label={`Anchor ${index + 1} label`}
                            value={anchor.label ?? anchor.id}
                            onChange={(event) => updateSelectedAnchor(index, { label: event.target.value })}
                          />
                          <select
                            aria-label={`Anchor ${index + 1} side`}
                            value={anchor.side}
                            onChange={(event) => updateSelectedAnchor(index, { side: event.target.value as TemplateAnchor["side"] })}
                          >
                            <option value="left">left</option>
                            <option value="right">right</option>
                            <option value="top">top</option>
                            <option value="bottom">bottom</option>
                            <option value="center">center</option>
                          </select>
                          <input
                            aria-label={`Anchor ${index + 1} offset`}
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={anchor.offset}
                            onChange={(event) => updateSelectedAnchor(index, { offset: Number(event.target.value) })}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="tool-button panel-action" onClick={() => setShowDisplayPatch(true)}>
                    <Download size={15} aria-hidden="true" />
                    Export display rules
                  </button>
                  {showDisplayPatch ? (
                    <textarea className="override-output" aria-label="Display rules JSON" readOnly value={displayPatch} />
                  ) : null}
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
    </main>
  );
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
    "node_id,type,layer,module,cabinet,slot,order,display_name,template_id,remarks",
    ...templateComponentSpecs.map((item) =>
      formatCsvRow([
        item.id,
        item.componentType,
        item.layer,
        templateModuleName,
        "SENS-CAB",
        item.slot,
        String(item.order),
        item.displayName,
        templateIdForGeneratedSpec(item),
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
      layerOrder: ["interface", "breakout", "part", "route"],
      moduleOrder: [templateModuleName],
      moduleGap: 700,
      dx: 300,
      dy: 28,
      cabinetGap: 900,
      slotGap: 120,
      boardGap: 24,
      projectionDefaults: { mode: "layer", minVisibleLayer: "interface" }
    },
    display: {
      templates: DEFAULT_DISPLAY_RULES.templates,
      kindTemplates: DEFAULT_DISPLAY_RULES.kindTemplates,
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
