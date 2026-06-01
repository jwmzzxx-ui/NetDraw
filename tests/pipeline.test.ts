import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { PipelineValidationError, runPipeline } from "../src/pipeline.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("runPipeline", () => {
  test("writes graph and cable list artifacts for a small sample", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);

    const summary = await runPipeline({
      inputPath: "samples/interfaces.csv",
      outDir
    });

    expect(summary.cableCount).toBe(5);
    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.logicalCableCount).toBe(5);
    expect(summary.routeSegmentCount).toBe(5);
    expect(summary.validationIssueCount).toBe(0);
    await expect(stat(join(outDir, "canonical-graph.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "cable-list.csv"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "cable-list.xlsx"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "analysis-report.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "analysis-report.md"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "model-diagnostics.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "model-diagnostics.md"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "validation-report.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "validation-report.md"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "positioned-graph.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "graph.svg"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "style-rules.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "legend.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "normalization-report.json"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "normalization-report.md"))).resolves.toBeTruthy();

    const graphJson = JSON.parse(await readFile(join(outDir, "canonical-graph.json"), "utf8"));
    expect(graphJson.edges.filter((edge: { type: string }) => edge.type === "logical-cable")).toHaveLength(5);
    expect(graphJson.edges.filter((edge: { type: string }) => edge.type === "route-segment")).toHaveLength(5);
    expect(graphJson.indexes.byCableId["CAB-COMM-001"].logicalCableEdgeIds).toEqual(["cable:CAB-COMM-001"]);
    expect(graphJson.diagnostics).toEqual([]);
    const modelDiagnostics = JSON.parse(await readFile(join(outDir, "model-diagnostics.json"), "utf8"));
    expect(modelDiagnostics.summary.errors).toBe(0);
    const modelDiagnosticsMarkdown = await readFile(join(outDir, "model-diagnostics.md"), "utf8");
    expect(modelDiagnosticsMarkdown).toContain("# NetDraw Model Diagnostics");
    const reportMarkdown = await readFile(join(outDir, "analysis-report.md"), "utf8");
    expect(reportMarkdown).toContain("# NetDraw Analysis Report");
    const validationMarkdown = await readFile(join(outDir, "validation-report.md"), "utf8");
    expect(validationMarkdown).toContain("# NetDraw Validation Report");
    const positionedGraph = JSON.parse(await readFile(join(outDir, "positioned-graph.json"), "utf8"));
    expect(positionedGraph.nodes[0].position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    const svg = await readFile(join(outDir, "graph.svg"), "utf8");
    expect(svg).toContain("NetDraw Graph");
  });

  test("applies normalization aliases from project rules and writes trace reports", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const inputPath = join(outDir, "interfaces.csv");
    const rulesPath = join(outDir, "rules.json");
    await writeFile(
      inputPath,
      [
        "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id",
        "R001,Control-A,控制板A,LAN 1,Switch 1,LINE_CARD,GE 01,COMM,ethernet,C-001"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      rulesPath,
      JSON.stringify({
        normalization: {
          aliases: {
            devices: {
              "Control-A": { normalizedName: "CTRL_A", displayName: "Control A" },
              "Switch 1": "SW_1"
            },
            boards: {
              "控制板A": { normalizedName: "CTRL_BOARD", displayName: "Control Board" }
            },
            ports: {
              "LAN 1": "LAN1",
              "GE 01": "GE_01"
            }
          }
        }
      }),
      "utf8"
    );

    await runPipeline({
      inputPath,
      rulesPath,
      outDir
    });

    const graphJson = JSON.parse(await readFile(join(outDir, "canonical-graph.json"), "utf8"));
    expect(graphJson.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "component:CTRL_A_CTRL_BOARD",
          displayName: "Control A/Control Board",
          metadata: expect.objectContaining({ originalNames: "Control-A/控制板A" }),
          ports: expect.arrayContaining([expect.objectContaining({ portId: "LAN1" })])
        }),
      ])
    );
    const normalizationReport = await readFile(join(outDir, "normalization-report.md"), "utf8");
    expect(normalizationReport).toContain("ALIAS_APPLIED");
    expect(normalizationReport).toContain("Control-A");
  });

  test("uses route resource table to complete missing route hops", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);

    await runPipeline({
      inputPath: "samples/interfaces-route-shortcut.csv",
      routesPath: "samples/routes.csv",
      outDir
    });

    const cableList = await readFile(join(outDir, "cable-list.csv"), "utf8");
    expect(cableList).toContain("SPL_A>PDU_1>CAB_3");
  });

  test("uses A* route completion when routing rules request it and coordinates are available", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const routesPath = join(outDir, "routes.csv");
    const rulesPath = join(outDir, "rules.json");
    await writeFile(
      routesPath,
      [
        "from_route_node,to_route_node,cost,from_x,from_y,to_x,to_y",
        "SPL_A,PDU_1,5,0,0,5,0",
        "PDU_1,CAB_3,5,5,0,10,0",
        "SPL_A,CAB_3,30,0,0,10,0"
      ].join("\n"),
      "utf8"
    );
    await writeFile(rulesPath, JSON.stringify({ routing: { preferAStar: true } }), "utf8");

    await runPipeline({
      inputPath: "samples/interfaces-route-shortcut.csv",
      routesPath,
      rulesPath,
      outDir
    });

    const graphJson = JSON.parse(await readFile(join(outDir, "canonical-graph.json"), "utf8"));
    const logicalCable = graphJson.edges.find((edge: { id: string }) => edge.id === "cable:CAB-ROUTE-001");
    expect(logicalCable.routeAlgorithm).toBe("astar");
    expect(logicalCable.sourceRow).toEqual(expect.objectContaining({ cableId: "CAB-ROUTE-001" }));
    expect(logicalCable.routeString).toBe("SPL_A>PDU_1>CAB_3");
    expect(logicalCable.sourceRow).toEqual(expect.objectContaining({ routeHint: "SPL_A>CAB_3" }));
  });

  test("passes ExportConfig through to cable list artifact names", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);

    await runPipeline({
      inputPath: "samples/interfaces-route-shortcut.csv",
      routesPath: "samples/routes.csv",
      outDir,
      exportConfig: { fileBaseName: "cables" }
    });

    await expect(stat(join(outDir, "cables.csv"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "cables.xlsx"))).resolves.toBeTruthy();
    const cableList = await readFile(join(outDir, "cables.csv"), "utf8");
    expect(cableList.slice(1).split("\n")[0]).toContain("route_nodes");
    expect(cableList).toContain("SPL_A>PDU_1>CAB_3");
  });

  test("applies project rules for layout overrides, styles, and export naming", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const rulesPath = join(outDir, "rules.json");
    await writeFile(
      rulesPath,
      JSON.stringify({
        layout: {
          dx: 300,
          overridePositions: {
            "component:PART_A_BRK_A": { x: 1111, y: 222 }
          }
        },
        style: {
          netTypes: {
            AC: { color: "#aa3300", width: 5 }
          }
        },
        display: {
          nodeTemplates: {
            "device:PART_A": "part-sensor"
          },
          templateOverrides: {
            "device:PART_A": { width: 210, label: "Part Sensor" }
          }
        },
        export: {
          fileBaseName: "rules-cables"
        }
      }),
      "utf8"
    );

    await runPipeline({
      inputPath: "samples/interfaces.csv",
      outDir,
      rulesPath
    });

    await expect(stat(join(outDir, "rules-cables.csv"))).resolves.toBeTruthy();
    const positionedGraph = JSON.parse(await readFile(join(outDir, "positioned-graph.json"), "utf8"));
    const overridden = positionedGraph.nodes.find((node: { id: string }) => node.id === "component:PART_A_BRK_A");
    expect(overridden.position).toEqual({ x: 1111, y: 222 });
    expect(positionedGraph.displayRules.nodeTemplates["device:PART_A"]).toBe("part-sensor");
    expect(positionedGraph.displayRules.templateOverrides["device:PART_A"]).toEqual(expect.objectContaining({ width: 210, label: "Part Sensor" }));
    const styleRules = JSON.parse(await readFile(join(outDir, "style-rules.json"), "utf8"));
    expect(styleRules.netTypes.AC.color).toBe("#aa3300");
    const svg = await readFile(join(outDir, "graph.svg"), "utf8");
    expect(svg).toContain("stroke=\"#aa3300\"");
  });

  test("applies components table metadata into graph and layout outputs", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const componentsPath = join(outDir, "components.csv");
    await writeFile(
      componentsPath,
      [
        "node_id,type,layer,cabinet,slot,order,display_name",
        "device:PART_A,part,part,CAB-A,SLOT-01,1,Part Alpha",
        "board:PART_A/BRK_A,breakout,breakout,CAB-A,SLOT-01,2,Breakout A",
        "port:PART_A/BRK_A/PWR_IN,port,breakout,CAB-A,SLOT-01,3,Power Input"
      ].join("\n"),
      "utf8"
    );

    await runPipeline({
      inputPath: "samples/interfaces.csv",
      componentsPath,
      outDir
    });

    const graphJson = JSON.parse(await readFile(join(outDir, "canonical-graph.json"), "utf8"));
    const component = graphJson.nodes.find((node: { id: string }) => node.id === "component:PART_A_BRK_A");
    expect(component.displayName).toBe("Power Input");
    expect(component.metadata).toEqual(expect.objectContaining({ cabinet: "CAB-A", slot: "SLOT-01", order: "3" }));

    const positionedGraph = JSON.parse(await readFile(join(outDir, "positioned-graph.json"), "utf8"));
    const positionedComponent = positionedGraph.nodes.find((node: { id: string }) => node.id === "component:PART_A_BRK_A");
    expect(positionedComponent.layout.layer).toBe("L1");
    expect(positionedComponent.layout.layerId).toBe("L1");
    expect(positionedComponent.layout.cabinet).toBe("CAB-A");
  });

  test("reports unmatched component metadata rows as a warning diagnostic", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const componentsPath = join(outDir, "components.csv");
    await writeFile(
      componentsPath,
      [
        "node_id,type,layer,cabinet,slot,order,display_name",
        "device:PART_A,part,part,CAB-A,SLOT-01,1,Part Alpha",
        "device:UNKNOWN_PANEL,part,part,CAB-Z,SLOT-99,9,Unknown Panel"
      ].join("\n"),
      "utf8"
    );

    await runPipeline({
      inputPath: "samples/interfaces.csv",
      componentsPath,
      outDir
    });

    const modelDiagnostics = JSON.parse(await readFile(join(outDir, "model-diagnostics.json"), "utf8"));
    expect(modelDiagnostics.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_COMPONENT_NODE",
          severity: "warning",
          nodeId: "device:UNKNOWN_PANEL"
        })
      ])
    );
  });

  test("stops before writing graph artifacts when blocking validation errors exist", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-"));
    tempDirs.push(outDir);
    const invalidPath = join(outDir, "invalid.csv");
    await writeFile(
      invalidPath,
      [
        "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id",
        "R001,A,B1,P1,B,B2,P2,COMM,ethernet,C-001",
        "R001,C,B3,P3,D,B4,P4,COMM,ethernet,C-002"
      ].join("\n"),
      "utf8"
    );

    await expect(runPipeline({ inputPath: invalidPath, outDir })).rejects.toThrow(PipelineValidationError);
    await expect(stat(join(outDir, "canonical-graph.json"))).rejects.toThrow();
  });
});
