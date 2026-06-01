import type { InterfaceRow, NormalizationLog, NormalizedInterfaceRow, NormalizedName } from "./types.js";

export type AliasTarget = string | { normalizedName: string; displayName?: string };

export interface NormalizationAliases {
  global?: Record<string, AliasTarget>;
  components?: Record<string, AliasTarget>;
  devices?: Record<string, AliasTarget>;
  boards?: Record<string, AliasTarget>;
  ports?: Record<string, AliasTarget>;
}

export interface NormalizationResult {
  rows: NormalizedInterfaceRow[];
  logs: NormalizationLog[];
}

type NormalizedField = keyof NormalizedInterfaceRow["normalized"];
type AliasCategory = "components" | "devices" | "boards" | "ports";

const fieldCategories: Record<NormalizedField, AliasCategory> = {
  srcComponent: "components",
  dstComponent: "components",
  srcDevice: "devices",
  dstDevice: "devices",
  srcBoard: "boards",
  dstBoard: "boards",
  srcPort: "ports",
  dstPort: "ports"
};

export function normalizeInterfaceRows(rows: InterfaceRow[], aliases: NormalizationAliases = {}): NormalizationResult {
  const logs: NormalizationLog[] = [];
  const displayByNormalizedName = new Map<string, { displayName: string; rowId: string; field: NormalizedField }>();

  const normalizedRows = rows.map<NormalizedInterfaceRow>((row) => {
    const normalized = {} as NormalizedInterfaceRow["normalized"];

    for (const field of Object.keys(fieldCategories) as NormalizedField[]) {
      const rawValue = readRowField(row, field);
      if (!rawValue && field !== "srcComponent" && field !== "dstComponent" && field !== "srcPort" && field !== "dstPort") {
        continue;
      }
      const name = field === "srcComponent" && !row.srcComponent
        ? normalizeLegacyComponent(row.srcDevice, row.srcBoard, aliases)
        : field === "dstComponent" && !row.dstComponent
          ? normalizeLegacyComponent(row.dstDevice, row.dstBoard, aliases)
          : normalizeName(rawValue, field, aliases);
      normalized[field] = name;

      if (name.originalName !== name.normalizedName || name.originalName !== name.displayName) {
        logs.push({
          code: "ALIAS_APPLIED",
          severity: "info",
          rowId: row.rowId,
          field,
          originalName: name.originalName,
          normalizedName: name.normalizedName,
          displayName: name.displayName,
          message: `${field} "${name.originalName}" normalized to "${name.normalizedName}"`
        });
      }

      const conflictKey = `${fieldCategories[field]}:${name.normalizedName.toLowerCase()}`;
      const previous = displayByNormalizedName.get(conflictKey);
      if (previous && previous.displayName !== name.displayName) {
        logs.push({
          code: "DISPLAY_NAME_CONFLICT",
          severity: "warning",
          rowId: row.rowId,
          field,
          originalName: name.originalName,
          normalizedName: name.normalizedName,
          displayName: name.displayName,
          message:
            `${fieldCategories[field]} normalized name "${name.normalizedName}" has display names ` +
            `"${previous.displayName}" and "${name.displayName}"`
        });
      } else if (!previous) {
        displayByNormalizedName.set(conflictKey, { displayName: name.displayName, rowId: row.rowId, field });
      }
    }

    return {
      ...row,
      normalized
    };
  });

  return {
    rows: normalizedRows,
    logs
  };
}

function readRowField(row: InterfaceRow, field: NormalizedField): string {
  if (field === "srcComponent") {
    return row.srcComponent ?? legacyComponentName(row.srcDevice, row.srcBoard);
  }
  if (field === "dstComponent") {
    return row.dstComponent ?? legacyComponentName(row.dstDevice, row.dstBoard);
  }
  return String(row[field] ?? "");
}

function legacyComponentName(device: string | undefined, board: string | undefined): string {
  return [device, board].filter(Boolean).join("/") || device || board || "";
}

function normalizeLegacyComponent(device: string | undefined, board: string | undefined, aliases: NormalizationAliases): NormalizedName {
  const rawDevice = device ?? "";
  const rawBoard = board ?? "";
  const normalizedDevice = normalizeName(rawDevice, "srcDevice", aliases);
  const normalizedBoard = normalizeName(rawBoard, "srcBoard", aliases);
  const originalName = legacyComponentName(rawDevice, rawBoard);
  const normalizedName = legacyComponentName(normalizedDevice.normalizedName, normalizedBoard.normalizedName);
  const displayName = legacyComponentName(normalizedDevice.displayName, normalizedBoard.displayName);
  return {
    originalName,
    normalizedName,
    displayName,
    slug: toSlug(normalizedName)
  };
}

export function toSlug(value: string): string {
  const slug = value.trim().replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "unnamed";
}

export function renderNormalizationMarkdown(logs: NormalizationLog[]): string {
  const infoCount = logs.filter((log) => log.severity === "info").length;
  const warningCount = logs.filter((log) => log.severity === "warning").length;
  const rows = logs.length === 0
    ? ["No normalization changes found."]
    : logs.map(
        (log) =>
          `- **${log.severity.toUpperCase()}** ${log.code} row=${log.rowId} field=${log.field}: ${log.message}`
      );

  return [
    "# NetDraw Normalization Report",
    "",
    `Info: ${infoCount}`,
    `Warnings: ${warningCount}`,
    "",
    "## Logs",
    "",
    ...rows,
    ""
  ].join("\n");
}

function normalizeName(value: string, field: NormalizedField, aliases: NormalizationAliases): NormalizedName {
  const originalName = value.trim();
  const aliasTarget = findAlias(originalName, fieldCategories[field], aliases);
  const normalizedName = readNormalizedName(aliasTarget) ?? originalName;
  const displayName = readDisplayName(aliasTarget) ?? normalizedName;

  return {
    originalName,
    normalizedName,
    displayName,
    slug: toSlug(normalizedName)
  };
}

function findAlias(
  originalName: string,
  category: AliasCategory,
  aliases: NormalizationAliases
): AliasTarget | undefined {
  const categoryAliases = aliases[category];
  const legacyAliases = category === "components"
    ? findAliasInMap(originalName, aliases.boards) ?? findAliasInMap(originalName, aliases.devices)
    : undefined;
  return findAliasInMap(originalName, categoryAliases) ?? legacyAliases ?? findAliasInMap(originalName, aliases.global);
}

function findAliasInMap(originalName: string, aliasMap: Record<string, AliasTarget> | undefined): AliasTarget | undefined {
  if (!aliasMap) {
    return undefined;
  }

  const lookupKey = originalName.toLowerCase();
  const actualKey = Object.keys(aliasMap).find((key) => key.trim().toLowerCase() === lookupKey);
  return actualKey ? aliasMap[actualKey] : undefined;
}

function readNormalizedName(target: AliasTarget | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  return typeof target === "string" ? target : target.normalizedName;
}

function readDisplayName(target: AliasTarget | undefined): string | undefined {
  if (!target || typeof target === "string") {
    return undefined;
  }
  return target.displayName;
}
