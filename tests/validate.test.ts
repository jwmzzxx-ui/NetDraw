import { describe, expect, test } from "vitest";
import { renderValidationMarkdown, summarizeValidationIssues, validateInterfaceRows } from "../src/validate.js";
import type { InterfaceRow } from "../src/types.js";

describe("validateInterfaceRows", () => {
  test("detects duplicate cable ids and unsupported network types", () => {
    const rows = [
      {
        rowId: "R001",
        srcDevice: "A",
        srcBoard: "B1",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "B2",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      },
      {
        rowId: "R002",
        srcDevice: "C",
        srcBoard: "B3",
        srcPort: "P3",
        dstDevice: "D",
        dstBoard: "B4",
        dstPort: "P4",
        netType: "POWER",
        medium: "power",
        cableId: "C-001"
      }
    ] as InterfaceRow[];

    const issues = validateInterfaceRows(rows);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_CABLE_ID", "UNSUPPORTED_NET_TYPE"])
    );
  });

  test("classifies blocking errors separately from warnings", () => {
    const rows = [
      {
        rowId: "R001",
        srcDevice: "A",
        srcBoard: "B1",
        srcPort: "",
        dstDevice: "B",
        dstBoard: "B2",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      },
      {
        rowId: "R001",
        srcDevice: "C",
        srcBoard: "B3",
        srcPort: "P3",
        dstDevice: "D",
        dstBoard: "B4",
        dstPort: "P4",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      }
    ] as InterfaceRow[];

    const issues = validateInterfaceRows(rows);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MISSING_ENDPOINT", severity: "error" }),
        expect.objectContaining({ code: "DUPLICATE_ROW_ID", severity: "error" }),
        expect.objectContaining({ code: "DUPLICATE_CABLE_ID", severity: "warning" })
      ])
    );
  });

  test("summarizes validation issues by severity and renders markdown", () => {
    const issues = validateInterfaceRows([
      {
        rowId: "R001",
        srcDevice: "A",
        srcBoard: "B1",
        srcPort: "P1",
        dstDevice: "B",
        dstBoard: "B2",
        dstPort: "P2",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      },
      {
        rowId: "R002",
        srcDevice: "C",
        srcBoard: "B3",
        srcPort: "P3",
        dstDevice: "D",
        dstBoard: "B4",
        dstPort: "P4",
        netType: "COMM",
        medium: "ethernet",
        cableId: "C-001"
      }
    ] as InterfaceRow[]);

    expect(summarizeValidationIssues(issues)).toEqual({ errors: 0, warnings: 1, suggestions: 0 });
    expect(renderValidationMarkdown(issues)).toContain("# NetDraw Validation Report");
    expect(renderValidationMarkdown(issues)).toContain("DUPLICATE_CABLE_ID");
  });
});
