import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertCableExportConsistency,
  generateCableListRows,
  writeCableListArtifacts,
  writeCableListCsv,
  writeCableListXlsx
} from "../src/exportCableList.js";
import { buildCanonicalGraph } from "../src/model.js";
import type { InterfaceRow, ResolvedCableRoute } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("generateCableListRows", () => {
  test("generates one cable list row for each logical cable edge", () => {
    const { graph, sourceRows } = createGraph();
    const cableRows = generateCableListRows(graph);

    expect(cableRows).toHaveLength(sourceRows.length);
    expect(cableRows[0]).toEqual(
      expect.objectContaining({
        cableId: "C-001",
        srcDevice: "Device A",
        dstDevice: "Device B",
        routeNodes: "PDU_1>TRAY_1",
        routeString: "PDU_1>TRAY_1"
      })
    );
  });

  test("writes a UTF-8 BOM CSV with snake_case export headers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-export-"));
    tempDirs.push(outDir);
    const rows = generateCableListRows(createGraph().graph);
    const csvPath = join(outDir, "cables.csv");

    await writeCableListCsv(rows, csvPath);

    const csv = await readFile(csvPath, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\n")[0]).toBe(
      "cable_id,net_type,medium,cable_type,src_device,src_board,src_port,dst_device,dst_board,dst_port,route_nodes,route_string,redundancy_group,remarks"
    );
  });

  test("writes an XLSX workbook with styled headers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-export-"));
    tempDirs.push(outDir);
    const rows = generateCableListRows(createGraph().graph);
    const xlsxPath = join(outDir, "cables.xlsx");

    await writeCableListXlsx(rows, xlsxPath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    const worksheet = workbook.getWorksheet("Cable List");
    expect(worksheet?.getRow(1).font.bold).toBe(true);
    expect(worksheet?.getCell("A1").value).toBe("cable_id");
    expect(worksheet?.getCell("K2").value).toBe("PDU_1>TRAY_1");
  });

  test("rejects exports when cable rows do not match logical cable count", () => {
    const { graph } = createGraph();

    expect(() => assertCableExportConsistency(graph, generateCableListRows(graph).slice(0, 1))).toThrow(
      "Cable export count mismatch"
    );
  });

  test("supports ExportConfig file names for cables.csv and cables.xlsx", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-export-"));
    tempDirs.push(outDir);

    await writeCableListArtifacts(createGraph().graph, outDir, { fileBaseName: "cables" });

    await expect(stat(join(outDir, "cables.csv"))).resolves.toBeTruthy();
    await expect(stat(join(outDir, "cables.xlsx"))).resolves.toBeTruthy();
  });
});

function createGraph() {
  const sourceRows: InterfaceRow[] = [
    {
      rowId: "R001",
      srcDevice: "Device A",
      srcBoard: "Board A",
      srcPort: "P1",
      dstDevice: "Device B",
      dstBoard: "Board B",
      dstPort: "P2",
      netType: "DC",
      medium: "power",
      cableId: "C-001",
      routeHint: "PDU_1>TRAY_1"
    },
    {
      rowId: "R002",
      srcDevice: "Device C",
      srcBoard: "Board C",
      srcPort: "P3",
      dstDevice: "Device D",
      dstBoard: "Board D",
      dstPort: "P4",
      netType: "SAFETY",
      medium: "safety",
      cableId: "C-002"
    }
  ];

  const resolvedRoutes: ResolvedCableRoute[] = [
    {
      cableId: "C-001",
      algorithm: "explicit",
      routeNodes: ["PDU_1", "TRAY_1"],
      routeSegments: [{ source: "PDU_1", target: "TRAY_1", cost: 1 }],
      routeString: "PDU_1>TRAY_1"
    }
  ];

  return {
    sourceRows,
    graph: buildCanonicalGraph(sourceRows, resolvedRoutes)
  };
}
