import { useId, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Cable, Download, Eye, Filter, Gauge, GitBranch, Layers3, Search, TriangleAlert, Upload } from "lucide-react";
import type { GraphEdge, PositionedGraph, Position } from "../../src/types.js";
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
  const [showOverridePatch, setShowOverridePatch] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [interfaceFile, setInterfaceFile] = useState<File | null>(null);
  const [routesFile, setRoutesFile] = useState<File | null>(null);
  const [componentsFile, setComponentsFile] = useState<File | null>(null);
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const interfaceInputId = useId();
  const routesInputId = useId();
  const componentsInputId = useId();
  const rulesInputId = useId();
  const renderedGraph = useMemo(
    () => applyOverridePositions(positionedGraph, overridePositions, edgeBendPoints),
    [positionedGraph, overridePositions, edgeBendPoints]
  );
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
            <span>{filters.mode === "overview" ? "Overview projection" : "Detail projection"}</span>
            <span>{filters.mode === "overview" ? "Route segments hidden" : "Route segments visible"}</span>
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
              <p>{selectedNode.layout.reason}</p>
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
