# NetDraw Project Memory

## Research Baseline

NetDraw builds from the research report at `C:/Users/Administrator/OneDrive/桌面/deep-research-report.md`. The core direction is not to hand the entire problem to a single automatic graph layout engine. The project baseline is:

- Use Cytoscape.js as the interactive graph and graph-operation core.
- Normalize interface tables into a full canonical graph before rendering or exporting.
- Keep physical frame coordinates rule-driven and preset-first.
- Use ELK layered/orthogonal layout only for local detail views and later refinements.
- Model cables and physical route segments separately.
- Generate cable lists from the canonical model, not from rendered graph state.
- Treat compound nodes as semantic hierarchy only; stable physical boundaries belong in rules or a separate visual layer.
- Do not keep a 5000-cable graph fully expanded by default. Use overview/detail projections, filtering, edge summarization, and label degradation.

## Technical Defaults

- Runtime: Node.js and TypeScript.
- Package manager: npm single repository.
- Input: CSV/XLSX interface tables.
- Parsing: Papa Parse for CSV, SheetJS for XLSX.
- Validation: zod schemas plus project-specific graph checks.
- Export: CSV and XLSX cable list through ExcelJS.
- Visualization baseline: Cytoscape.js renders the current React workbench, with ELK reserved for local detail relayout.
- Image export: SVG is generated directly; optional PNG/PDF export uses local Chrome or Edge headless from the SVG artifact.

## Data Modeling Rules

- One interface row represents one logical cable connection in this MVP.
- Ports are explicit graph nodes, not only node attributes.
- Devices own boards; boards own ports.
- Cable edges connect source port nodes to destination port nodes.
- `routeHint` is parsed into route-node chains. Without a routes table, the hint is treated as an explicit chain. With a routes table, adjacent hint anchors are expanded through the shortest available route-resource path.
- Route resources can carry `from_x/from_y/to_x/to_y` geometry. When `routing.preferAStar` or `--prefer-astar` is enabled and all route edges have coordinates, route completion uses A* and records `routeAlgorithm: "astar"` on graph edges; otherwise it records Dijkstra or explicit routing.
- Resolved route chains are written back into the canonical graph as route-node nodes and route-segment edges, while cable count still only counts logical-cable edges.
- `CanonicalGraph` includes query indexes: `byId`, `byCableId`, and `byParent`, plus model diagnostics for duplicate IDs, missing parents, missing endpoints, and route-chain mismatches.
- `traceCable(graph, cableId)` is the canonical way to recover a logical cable, its two endpoint ports, and its route-segment chain without rescanning every edge manually.
- Network types are restricted to `AC`, `DC`, `COMM`, `SIGNAL`, and `SAFETY`.

## Engineering Boundaries

- The first milestone must prove the end-to-end path: sample interface table, parser, canonical graph, cable list export, validation summary.
- Full edge-editing plugin integration, full rules UI, A* geometry routing, and production-grade 5000-cable browser canvas benchmarking are explicitly future work.
- The workbench must keep large-system safeguards in place: overview mode uses summary edges, detail mode restores true edges, port labels are hidden in overview, board/port/route labels are gated by zoom, and lookups should use by-id indexes instead of selector scans.
- Documentation should preserve why decisions were made, especially where Cytoscape.js is not used as a CAD-like physical container.

## Current Verified Capability

- `npm run demo` validates the default sample and exports a canonical graph plus cable list.
- `npm run demo:routes` validates route resource completion: `SPL_A>CAB_3` resolves to `SPL_A>PDU_1>CAB_3` using `samples/routes.csv`.
- `npm run demo:astar` validates geometry-aware A* route completion using `samples/routes-geometry.csv` and `samples/rules-astar.json`.
- The pipeline now exports `analysis-report.json` and `analysis-report.md`.
- The pipeline now exports `model-diagnostics.json` and `model-diagnostics.md` from `CanonicalGraph.diagnostics`, separating structural graph diagnostics from higher-level analysis findings.
- The pipeline now exports `validation-report.json` and `validation-report.md`; validation issues are classified as `error`, `warning`, or `suggestion`.
- Blocking validation errors, such as duplicate `row_id`, missing endpoint fields, and unsupported network types, stop the pipeline before graph/cable artifacts are written.
- `npm run verify:samples` runs the committed valid samples plus expected-failure samples for parser errors, duplicate row IDs, and broken route resources.
- The parser keeps `rawRecord` on each `InterfaceRow` for traceability, and the normalizer can apply `rules.normalization.aliases` for device, board, and port synonyms before graph IDs are generated.
- The pipeline writes `normalization-report.json` and `normalization-report.md`; `npm run demo:aliases` proves that alias inputs such as `Control-A`, `控制板A`, and `LAN 1` map to stable normalized IDs.
- `canonical-graph.json` now carries model indexes and diagnostics, so downstream exports, UI selection, and review tooling can resolve graph objects by ID, cable ID, or parent ID consistently.
- The analysis module detects directed cycles through strongly connected components, parallel logical cables, redundancy group issues, isolated ports, and undefined route-node references.
- Analysis visual suggestions identify summary edges for overview aggregation and detail edges for expanded views.
- The layout module now generates a deterministic preset `positioned-graph.json` from `LayoutRules`.
- Layout x coordinates come from `layerOrder`; y coordinates combine cabinet, slot, device order, board order, and node order.
- Layout overrides can pin exact coordinates, and final coordinate collisions are offset with warnings.
- `explainPosition(positionedGraph, nodeId)` returns the reason for a node's coordinates.
- The webapp now provides a React + Vite + Cytoscape workbench with preset graph rendering, netType filtering, overview/detail projection, inspector details, neighborhood highlighting, and a local ELK action hook.
- The web graph adapter now folds overview cables into source/target/netType summary edges while preserving logical cables and route segments in detail mode.
- Selecting a device or board highlights its descendant ports, directly incident cables, and one-hop neighbor ports without recursively spreading through the rest of the route graph.
- The webapp includes a benchmark panel with parse, graph build, render init, detail expansion, and export timing fields.
- `generateSyntheticPositionedGraph({ cableCount: 5000, averageRouteHop: 2 })` provides deterministic web-adapter large-graph test data with 5000 logical cables and 10000 route segments.
- `generateSyntheticNetwork()` in `src/testkit.ts` provides Prompt J synthetic data across part, breakout, interface, control, switch, and ipc layers, including all five network classes plus redundancy and loop ratios.
- `npm run benchmark` writes `output/benchmark/benchmark-report.json` plus `benchmark-cables.csv/xlsx`; it measures Node-side overview adapter time, detail expansion adapter time, export time, and peak heap.
- `docs/testkit.md` documents benchmark usage and `.github/workflows/netdraw-ci.example.yml` provides a CI example.
- `src/styleRules.ts` is now the shared style source for net colors, line styles, node styles, Cytoscape stylesheet generation, and legend items.
- The pipeline now writes `style-rules.json`, `legend.json`, and a dependency-light `graph.svg` rendered from `positioned-graph.json`.
- Optional `--export-images` converts `graph.svg` to `graph.png` and `graph.pdf` through local Chrome/Edge headless, avoiding GPL SVG plugin coupling.
- `src/rulesConfig.ts` loads and merges project `rules.json` files for layout rules, style overrides, and export configuration.
- `layout.edgeBendPoints` is supported in rules and is consumed by both SVG export and the Cytoscape workbench segment-edge adapter.
- CLI and package scripts support `--rules`; `npm run demo:rules` uses `samples/rules.json` and writes rule-driven artifacts to `output/rules-demo`.
- `src/components.ts` parses optional components CSV/XLSX metadata and applies node display names, component types, layers, cabinet, slot, and order before layout.
- CLI and package scripts support `--components`; `npm run demo:components` combines `samples/interfaces.csv`, `samples/components.csv`, and `samples/rules.json`.
- CLI and package scripts support `--export-images`; `npm run demo:images` writes PNG/PDF image artifacts to `output/image-demo`.
- The web workbench records dragged node positions and selected-edge bend points, then exports a stable layout override JSON patch that can be merged back into `rules.json`.
- The cable exporter now has an `ExportConfig` path: the default pipeline keeps `cable-list.csv/xlsx`, while `fileBaseName: "cables"` writes the report-specified `cables.csv/xlsx`.
- Cable CSV exports are UTF-8 BOM encoded with snake_case headers and include both `route_nodes` and `route_string`; XLSX exports use styled headers.
- Export consistency is checked before writing artifacts so logical cable count and cable-list row count cannot silently diverge.
- `npm run web:build` builds the workbench into `dist/webapp`.
- `npm test` covers parser aliases, graph building, route parsing/completion/blocking errors, cable list generation/configuration, analysis reporting, layout rules, web graph adaptation, benchmark utilities, testkit generation, workbench controls, and pipeline outputs.
