import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";
import type { CableListRow, CanonicalGraph, ExportConfig } from "./types.js";

interface ExportColumn {
  key: keyof CableListRow;
  header: string;
}

const exportColumns: ExportColumn[] = [
  { key: "cableId", header: "cable_id" },
  { key: "netType", header: "net_type" },
  { key: "medium", header: "medium" },
  { key: "cableType", header: "cable_type" },
  { key: "srcDevice", header: "src_device" },
  { key: "srcBoard", header: "src_board" },
  { key: "srcPort", header: "src_port" },
  { key: "dstDevice", header: "dst_device" },
  { key: "dstBoard", header: "dst_board" },
  { key: "dstPort", header: "dst_port" },
  { key: "routeNodes", header: "route_nodes" },
  { key: "routeString", header: "route_string" },
  { key: "redundancyGroup", header: "redundancy_group" },
  { key: "remarks", header: "remarks" }
];

export function generateCableListRows(graph: CanonicalGraph): CableListRow[] {
  return graph.edges
    .filter((edge) => edge.type === "logical-cable")
    .map((edge) => {
      const source = edge.sourceRow;
      return {
        cableId: edge.cableId,
        netType: edge.netType,
        medium: edge.medium,
        cableType: edge.cableType ?? "",
        srcDevice: source.srcDevice,
        srcBoard: source.srcBoard,
        srcPort: source.srcPort,
        dstDevice: source.dstDevice,
        dstBoard: source.dstBoard,
        dstPort: source.dstPort,
        routeNodes: edge.routeNodes?.join(">") ?? "",
        routeString: edge.routeNodes?.join(">") ?? edge.routeString ?? source.routeHint ?? "",
        redundancyGroup: source.redundancyGroup ?? "",
        direction: source.direction ?? "",
        remarks: source.remarks ?? ""
      };
    });
}

export async function writeCableListArtifacts(graph: CanonicalGraph, outDir: string, config: ExportConfig = {}): Promise<CableListRow[]> {
  const rows = generateCableListRows(graph);
  assertCableExportConsistency(graph, rows);
  await mkdir(outDir, { recursive: true });
  await writeCableListCsv(rows, join(outDir, config.csvFileName ?? `${config.fileBaseName ?? "cable-list"}.csv`));
  await writeCableListXlsx(rows, join(outDir, config.xlsxFileName ?? `${config.fileBaseName ?? "cable-list"}.xlsx`));
  return rows;
}

export function assertCableExportConsistency(graph: CanonicalGraph, rows: CableListRow[]): void {
  const logicalCableCount = graph.edges.filter((edge) => edge.type === "logical-cable").length;
  if (logicalCableCount !== rows.length) {
    throw new Error(`Cable export count mismatch: graph has ${logicalCableCount} logical cables, export has ${rows.length} rows.`);
  }
}

export async function writeCableListCsv(rows: CableListRow[], filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const header = exportColumns.map((column) => column.header).join(",");
  const body = rows.map((row) => exportColumns.map((column) => escapeCsv(row[column.key])).join(","));
  await writeFile(filePath, `\uFEFF${[header, ...body].join("\n")}\n`, "utf8");
}

export async function writeCableListXlsx(rows: CableListRow[], filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cable List");

  worksheet.columns = exportColumns.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(14, column.header.length + 4)
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  headerRow.alignment = { vertical: "middle" };
  worksheet.addRows(rows);
  await workbook.xlsx.writeFile(filePath);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
