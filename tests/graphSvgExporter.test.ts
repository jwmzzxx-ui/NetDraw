import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { createPresetLayout } from "../src/layout.js";
import { buildCanonicalGraph } from "../src/model.js";
import { renderGraphSvg, writeGraphSvg } from "../src/graphSvgExporter.js";
import type { InterfaceRow, ResolvedCableRoute } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("graph SVG exporter", () => {
  test("renders styled nodes, edges, and legend into SVG", () => {
    const svg = renderGraphSvg(createFixtureGraph(), { title: "NetDraw Fixture" });

    expect(svg).toContain("<svg");
    expect(svg).toContain("NetDraw Fixture");
    expect(svg).toContain("Legend");
    expect(svg).toContain("CAB-001");
    expect(svg).toContain("stroke=\"#2563eb\"");
    expect(svg).toContain("TRAY_1");
  });

  test("writes an SVG artifact", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-svg-"));
    tempDirs.push(outDir);
    const filePath = join(outDir, "graph.svg");

    await writeGraphSvg(createFixtureGraph(), filePath, { title: "Artifact" });

    await expect(stat(filePath)).resolves.toBeTruthy();
    expect(await readFile(filePath, "utf8")).toContain("Artifact");
  });

  test("renders edge bend points as polyline paths", () => {
    const graph = createFixtureGraph();
    graph.rules.edgeBendPoints = {
      "cable:CAB-001": [{ x: 150, y: 260 }]
    };

    const svg = renderGraphSvg(graph);

    expect(svg).toContain("<polyline");
    expect(svg).toContain("150,260");
    expect(svg).not.toContain(`id="edge-cable:CAB-001"><line`);
  });

  test("renders cable endpoint connector boxes and middle cable id", () => {
    const svg = renderGraphSvg(createFixtureGraph(), { title: "Cable template" });

    expect(svg).toContain("LAN1");
    expect(svg).toContain("GE_01");
    expect(svg).toContain("CAB-001");
    expect(svg).toContain("<rect");
    expect(svg).toContain("stroke=\"#111827\"");
  });

  test("renders display templates into exported SVG nodes", () => {
    const graph = createFixtureGraph();
    graph.displayRules = {
      templates: {
        "part-sensor": {
          id: "part-sensor",
          label: "Part sensor",
          width: 190,
          height: 96,
          shape: "round-rectangle",
          fill: "#ffffff",
          stroke: "#737373",
          strokeWidth: 2,
          labelPosition: "title",
          ports: [{ id: "PHOTO_IN", side: "left", offset: 0.62 }],
          textBoxes: [{ id: "node-name", x: 30, y: 52, width: 120, height: 16, bind: "displayName", fontSize: 10, align: "center" }]
        }
      },
      cableTemplates: {
        "default-cable": {
          id: "default-cable",
          label: "Default cable",
          stroke: "#111111",
          strokeWidth: 4,
          lineStyle: "dashed",
          textBoxes: [{ id: "cable-note", x: 0, y: -20, width: 120, height: 16, bind: "sourceRow.remarks", fontSize: 10, align: "center" }]
        }
      },
      cableKindTemplates: { "logical-cable": "default-cable" },
      nodeTemplates: { "device:PART_A": "part-sensor" },
      kindTemplates: { device: "part-sensor" },
      templateOverrides: { "device:PART_A": { label: "Photo Sensor" } }
    };
    graph.edges[0].sourceRow.remarks = "Cable label";

    const svg = renderGraphSvg(graph);

    expect(svg).toContain("Photo Sensor");
    expect(svg).toContain("PHOTO_IN");
    expect(svg).toContain("PART_A");
    expect(svg).toContain("Cable label");
    expect(svg).toContain("width=\"190\"");
    expect(svg).toContain("<circle");
    expect(svg).toContain("stroke-width=\"4\"");
  });
});

function createFixtureGraph() {
  const rows: InterfaceRow[] = [
    {
      rowId: "R001",
      srcDevice: "PART_A",
      srcBoard: "CTRL_A",
      srcPort: "LAN1",
      dstDevice: "SW_1",
      dstBoard: "LINE_CARD",
      dstPort: "GE_01",
      netType: "COMM",
      medium: "ethernet",
      cableId: "CAB-001",
      routeHint: "TRAY_1>TRAY_2"
    }
  ];
  const routes: ResolvedCableRoute[] = [
    {
      cableId: "CAB-001",
      algorithm: "explicit",
      routeNodes: ["TRAY_1", "TRAY_2"],
      routeSegments: [{ source: "TRAY_1", target: "TRAY_2", cost: 1 }],
      routeString: "TRAY_1>TRAY_2"
    }
  ];

  return createPresetLayout(buildCanonicalGraph(rows, routes));
}
