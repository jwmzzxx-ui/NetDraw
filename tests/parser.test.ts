import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { parseInterfaceCsv, parseInterfaceTableData } from "../src/parser.js";

describe("parseInterfaceCsv", () => {
  test("normalizes CSV field aliases into InterfaceRow objects", () => {
    const csv = [
      "row_id,source_device,source_board,source_port,target_device,target_board,target_port,network_type,medium,cable_id",
      "A1,Device A,Board A,P1,Device B,Board B,P2,COMM,ethernet,C-001"
    ].join("\n");

    const rows = parseInterfaceCsv(csv);

    expect(rows).toEqual([
      expect.objectContaining({
        rowId: "A1",
        srcDevice: "Device A",
        srcBoard: "Board A",
        srcPort: "P1",
        dstDevice: "Device B",
        dstBoard: "Board B",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      })
    ]);
    expect(rows[0].rawRecord).toEqual(
      expect.objectContaining({
        source_device: "Device A",
        target_port: "P2"
      })
    );
  });

  test("reports readable errors when required endpoint fields are missing", () => {
    const csv = [
      "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium",
      "BAD001,Device A,Board A,,Device B,Board B,P2,COMM,ethernet"
    ].join("\n");

    expect(() => parseInterfaceCsv(csv)).toThrow(/srcPort/i);
  });

  test("parses xlsx table bytes into InterfaceRow objects", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        row_id: "X1",
        src_device: "Device A",
        src_board: "Board A",
        src_port: "P1",
        dst_device: "Device B",
        dst_board: "Board B",
        dst_port: "P2",
        net_type: "COMM",
        medium: "ethernet",
        cable_id: "C-001"
      }
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Interfaces");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const rows = parseInterfaceTableData("interfaces.xlsx", bytes);

    expect(rows).toEqual([
      expect.objectContaining({
        rowId: "X1",
        srcDevice: "Device A",
        dstDevice: "Device B",
        netType: "COMM",
        cableId: "C-001"
      })
    ]);
  });
});
