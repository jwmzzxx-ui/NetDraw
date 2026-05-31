import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { NET_TYPES, type InterfaceRow } from "./types.js";

type RawRecord = Record<string, unknown>;
type InterfaceInputField = Exclude<keyof InterfaceRow, "rawRecord">;

const fieldAliases: Record<InterfaceInputField, string[]> = {
  rowId: ["row_id", "rowid", "rowId", "id"],
  srcDevice: ["src_device", "source_device", "srcDevice", "sourceDevice"],
  srcBoard: ["src_board", "source_board", "srcBoard", "sourceBoard", "src_part", "source_part"],
  srcPort: ["src_port", "source_port", "srcPort", "sourcePort"],
  dstDevice: ["dst_device", "target_device", "dstDevice", "targetDevice", "destination_device"],
  dstBoard: ["dst_board", "target_board", "dstBoard", "targetBoard", "destination_board"],
  dstPort: ["dst_port", "target_port", "dstPort", "targetPort", "destination_port"],
  netType: ["net_type", "network_type", "netType", "networkType"],
  medium: ["medium", "cable_medium"],
  cableId: ["cable_id", "cableId", "wire_id", "wireId"],
  cableType: ["cable_type", "cableType", "wire_type", "wireType"],
  routeHint: ["route_hint", "routeHint", "route", "route_string"],
  redundancyGroup: ["redundancy_group", "redundancyGroup", "redundancy"],
  direction: ["direction", "flow_direction"],
  remarks: ["remarks", "remark", "notes", "comment"]
};

const interfaceRowSchema = z.object({
  rowId: z.string().trim().min(1),
  srcDevice: z.string().trim().min(1),
  srcBoard: z.string().trim().min(1),
  srcPort: z.string().trim().min(1),
  dstDevice: z.string().trim().min(1),
  dstBoard: z.string().trim().min(1),
  dstPort: z.string().trim().min(1),
  netType: z.enum(NET_TYPES),
  medium: z.string().trim().min(1),
  cableId: z.string().trim().optional(),
  cableType: z.string().trim().optional(),
  routeHint: z.string().trim().optional(),
  redundancyGroup: z.string().trim().optional(),
  direction: z.string().trim().optional(),
  remarks: z.string().trim().optional()
});

export function parseInterfaceCsv(csv: string): InterfaceRow[] {
  const parsed = Papa.parse<RawRecord>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse error at row ${firstError.row ?? "unknown"}: ${firstError.message}`);
  }

  return normalizeRecords(parsed.data);
}

export function parseInterfaceTableData(fileName: string, data: string | ArrayBuffer | Uint8Array): InterfaceRow[] {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".csv") {
    return parseInterfaceCsv(typeof data === "string" ? data : decodeText(data));
  }

  if (extension === ".xlsx" || extension === ".xls") {
    const workbook = XLSX.read(toBinaryView(data), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error(`Workbook has no sheets: ${fileName}`);
    }
    const sheet = workbook.Sheets[firstSheetName];
    const records = XLSX.utils.sheet_to_json<RawRecord>(sheet, { defval: "" });
    return normalizeRecords(records);
  }

  throw new Error(`Unsupported interface table file extension: ${extension}`);
}

export async function parseInterfaceTableFile(filePath: string): Promise<InterfaceRow[]> {
  return parseInterfaceTableData(filePath, await readFile(filePath));
}

function normalizeRecords(records: RawRecord[]): InterfaceRow[] {
  return records.map((record, index) => {
    const normalized: Partial<Record<keyof InterfaceRow, string>> = {};

    for (const [field, aliases] of Object.entries(fieldAliases) as Array<[keyof InterfaceRow, string[]]>) {
      normalized[field] = readFirstValue(record, aliases);
    }

    const result = interfaceRowSchema.safeParse(normalized);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid interface row ${index + 1}: ${details}`);
    }

    return {
      ...result.data,
      rawRecord: stringifyRecord(record)
    };
  });
}

function stringifyRecord(record: RawRecord): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value === null || value === undefined ? undefined : String(value).trim()
    ])
  );
}

function readFirstValue(record: RawRecord, aliases: string[]): string | undefined {
  const lowerKeyMap = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));

  for (const alias of aliases) {
    const actualKey = lowerKeyMap.get(alias.toLowerCase());
    if (!actualKey) {
      continue;
    }

    const value = record[actualKey];
    if (value === null || value === undefined) {
      return undefined;
    }

    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : undefined;
  }

  return undefined;
}

function decodeText(data: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8").decode(toBinaryView(data));
}

function toBinaryView(data: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
