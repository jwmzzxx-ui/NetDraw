import { NET_TYPES, type InterfaceRow, type ValidationIssue } from "./types.js";

const supportedNetTypes = new Set<string>(NET_TYPES);

export function validateInterfaceRows(rows: InterfaceRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rowIds = new Set<string>();
  const cableIds = new Map<string, string>();

  for (const row of rows) {
    if (rowIds.has(row.rowId)) {
      issues.push({
        code: "DUPLICATE_ROW_ID",
        rowId: row.rowId,
        severity: "error",
        message: `Duplicate row id: ${row.rowId}`
      });
    }
    rowIds.add(row.rowId);

    if (!supportedNetTypes.has(row.netType)) {
      issues.push({
        code: "UNSUPPORTED_NET_TYPE",
        rowId: row.rowId,
        severity: "error",
        message: `Unsupported network type "${row.netType}" in row ${row.rowId}`
      });
    }

    for (const field of ["srcDevice", "srcBoard", "srcPort", "dstDevice", "dstBoard", "dstPort"] as const) {
      if (!String(row[field] ?? "").trim()) {
        issues.push({
          code: "MISSING_ENDPOINT",
          rowId: row.rowId,
          severity: "error",
          message: `Missing endpoint field "${field}" in row ${row.rowId}`
        });
      }
    }

    if (row.cableId !== undefined && row.cableId.trim() === "") {
      issues.push({
        code: "EMPTY_CABLE_ID",
        rowId: row.rowId,
        severity: "warning",
        message: `Empty cable id in row ${row.rowId}`
      });
    }

    const cableId = row.cableId?.trim();
    if (cableId) {
      const firstRowId = cableIds.get(cableId);
      if (firstRowId) {
        issues.push({
          code: "DUPLICATE_CABLE_ID",
          rowId: row.rowId,
          cableId,
          severity: "warning",
          message: `Duplicate cable id "${cableId}" in rows ${firstRowId} and ${row.rowId}`
        });
      } else {
        cableIds.set(cableId, row.rowId);
      }
    }
  }

  return issues;
}

export function getBlockingValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function summarizeValidationIssues(issues: ValidationIssue[]): { errors: number; warnings: number; suggestions: number } {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    suggestions: issues.filter((issue) => issue.severity === "suggestion").length
  };
}

export function renderValidationMarkdown(issues: ValidationIssue[]): string {
  const summary = summarizeValidationIssues(issues);
  const rows = issues.length === 0
    ? ["No validation issues found."]
    : issues.map((issue) => `- **${issue.severity.toUpperCase()}** ${issue.code}${issue.rowId ? ` row=${issue.rowId}` : ""}: ${issue.message}`);

  return [
    "# NetDraw Validation Report",
    "",
    `Errors: ${summary.errors}`,
    `Warnings: ${summary.warnings}`,
    `Suggestions: ${summary.suggestions}`,
    "",
    "## Issues",
    "",
    ...rows,
    ""
  ].join("\n");
}
