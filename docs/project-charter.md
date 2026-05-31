# NetDraw Project Charter

## Goal

Build an open-source-based toolchain that turns interface tables for large equipment systems into a canonical physical network graph and a synchronized cable list.

## MVP Scope

- Initialize a runnable npm and TypeScript project.
- Read a small CSV/XLSX interface table.
- Normalize field aliases into a stable internal `InterfaceRow` shape.
- Build a canonical graph with devices, boards, ports, and cable edges.
- Include canonical graph indexes and diagnostics so IDs, cable lookups, parent/child traversal, and route-chain tracing are stable downstream interfaces.
- Resolve route hints into route-node chains and route-segment edges.
- Support Dijkstra route completion by default and optional geometry-aware A* when route resources include coordinates.
- Generate an analysis report for graph data quality and visualization guidance.
- Generate a rule-driven preset positioned graph for downstream Cytoscape rendering.
- Provide a runnable React/Cytoscape web workbench for graph preview, filtering, overview/detail projection, and basic performance telemetry.
- Keep the web graph projection scalable by using summary edges in overview mode, hiding port labels in overview, and restoring true cable/route edges in detail mode.
- Provide a synthetic 5000-cable testkit with multilayer data, all network classes, redundancy/loop knobs, benchmark output, and a CI example.
- File style rules for network color/line mappings, generate legend artifacts, export a basic SVG graph artifact, and optionally convert that SVG into PNG/PDF with local Chrome/Edge headless.
- Accept a project `rules.json` file so layout spacing, override positions, network styles, and export names are driven by versioned rules instead of hard-coded defaults.
- Accept normalization aliases in project rules so device, board, and port synonyms produce stable IDs while retaining original input values for traceability.
- Accept an optional `components` table so non-standard equipment, boards, ports, cabinet placement, slots, ordering, and display names are structured inputs rather than hard-coded assumptions.
- Let the workbench capture manually moved node positions and selected-edge bend points, then emit a layout override patch for rule-file writeback.
- Validate common data issues.
- Classify validation issues by severity and stop generation on blocking input errors.
- Export a cable list as UTF-8 BOM CSV and styled XLSX, with configurable artifact names for `cable-list.*` or report-aligned `cables.*`.
- Provide a demo command and automated tests for the baseline flow.

## Non-Goals For This Milestone

- No full physical layout engine.
- No full manual graph editor yet; current workbench captures node-position and selected-edge bend overrides, but does not include edge-editing handles or undo/redo history.
- No production-grade geometric routing optimizer; route completion supports weighted Dijkstra and optional A* over route-resource geometry, but not obstacle-aware cable tray routing.
- No automatic remediation of analysis issues; this milestone only reports them.
- Local ELK is exposed as a workbench action, but full per-cabinet expansion UX remains future work.
- No production 5000-cable browser canvas benchmark or performance budget enforcement; this milestone includes deterministic synthetic graph generation, Node-side projection/export timing, and unit coverage.

## Acceptance Criteria

- `npm run demo` reads `samples/interfaces.csv` and writes `output/canonical-graph.json`, `output/cable-list.csv`, and `output/cable-list.xlsx`.
- `canonical-graph.json` includes `indexes.byId`, `indexes.byCableId`, `indexes.byParent`, and model diagnostics.
- `npm run demo:routes` reads `samples/interfaces-route-shortcut.csv` plus `samples/routes.csv` and writes an expanded route string into the exported cable list.
- `npm run demo:astar` reads route-resource geometry, enables A*, and writes `routeAlgorithm: "astar"` into the canonical graph.
- The pipeline writes `analysis-report.json` and `analysis-report.md`.
- The pipeline writes `model-diagnostics.json` and `model-diagnostics.md`.
- The pipeline writes `validation-report.json` and `validation-report.md`.
- Blocking validation errors fail fast before graph and cable artifacts are generated.
- `npm run verify:samples` proves both valid sample paths and expected abnormal sample failures.
- The pipeline writes `positioned-graph.json` with coordinates and layout warnings.
- `npm run web:build` produces a runnable workbench bundle.
- The workbench includes graph stats, benchmark fields, overview summary edges, device/board neighborhood highlighting, and detail-mode expansion back to logical cable and route-segment edges.
- Synthetic benchmark generation can create a 5000-cable graph with deterministic route segments for future browser stress tests.
- `npm run benchmark` writes a benchmark report and benchmark cable exports for the synthetic network.
- `npm run demo:rules` proves the rules-file path by applying sample layout/style/export overrides.
- `npm run demo:aliases` proves the normalization alias path and writes normalization trace reports.
- `npm run demo:components` proves the combined interfaces/components/rules path.
- `npm run demo:images` proves optional PNG/PDF image export from the generated SVG artifact.
- Dragging nodes and adding selected-edge bend points in the workbench can produce a stable rules override JSON patch for `layout.overridePositions` and `layout.edgeBendPoints`.
- The demo prints node count, edge count, cable count, and validation issue count.
- Cable list export includes `route_nodes` and `route_string`, and fails fast if the export row count diverges from logical cable count.
- `npm run check` passes TypeScript checking.
- `npm test` passes parser, model, validation, export, and pipeline coverage.

## Risks

- Route completion is only as trustworthy as the supplied `routes` resource table.
- Physical layout quality depends on future rule files and templates, not on this MVP.
- PNG/PDF export now has a Chrome/Edge headless path, but Chinese-font and print-layout validation still need broader real-data testing before productization.
- Large graph performance must be handled by projection and filtering, not by always rendering every edge.
