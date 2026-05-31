import type { InterfaceRow, NormalizationLog, NormalizedInterfaceRow, NormalizedName } from "./types.js";

export type AliasTarget = string | { normalizedName: string; displayName?: string };

export interface NormalizationAliases {
  global?: Record<string, AliasTarget>;
  devices?: Record<string, AliasTarget>;
  boards?: Record<string, AliasTarget>;
  ports?: Record<string, AliasTarget>;
}

export interface NormalizationResult {
  rows: NormalizedInterfaceRow[];
  logs: NormalizationLog[];
}

type NormalizedField = keyof NormalizedInterfaceRow["normalized"];
type AliasCategory = "devices" | "boards" | "ports";

const fieldCategories: Record<NormalizedField, AliasCategory> = {
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
      const name = normalizeName(String(row[field]), field, aliases);
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
  return findAliasInMap(originalName, categoryAliases) ?? findAliasInMap(originalName, aliases.global);
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
