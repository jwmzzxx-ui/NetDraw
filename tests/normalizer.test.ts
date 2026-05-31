import { describe, expect, test } from "vitest";
import { normalizeInterfaceRows } from "../src/normalizer.js";
import type { InterfaceRow } from "../src/types.js";

const rows: InterfaceRow[] = [
  {
    rowId: "R001",
    srcDevice: "CTRL_A",
    srcBoard: "Control Board",
    srcPort: "LAN 1",
    dstDevice: "SW_1",
    dstBoard: "Line Card",
    dstPort: "GE-01",
    netType: "COMM",
    medium: "ethernet",
    cableId: "C-001"
  },
  {
    rowId: "R002",
    srcDevice: "Control-A",
    srcBoard: "控制板A",
    srcPort: "LAN-1",
    dstDevice: "Switch 1",
    dstBoard: "LINE_CARD",
    dstPort: "GE 01",
    netType: "COMM",
    medium: "ethernet",
    cableId: "C-002"
  }
];

describe("normalizeInterfaceRows", () => {
  test("applies aliases, generates stable slugs, and keeps original names for tracing", () => {
    const result = normalizeInterfaceRows(rows, {
      devices: {
        "Control-A": { normalizedName: "CTRL_A", displayName: "Control A" },
        "Switch 1": "SW_1"
      },
      boards: {
        "Control Board": { normalizedName: "CTRL_BOARD", displayName: "Control Board" },
        "控制板A": { normalizedName: "CTRL_BOARD", displayName: "Control Board" },
        "Line Card": "LINE_CARD"
      },
      ports: {
        "LAN 1": "LAN1",
        "LAN-1": "LAN1",
        "GE 01": "GE_01"
      }
    });

    expect(result.rows[0].normalized.srcDevice).toEqual({
      originalName: "CTRL_A",
      normalizedName: "CTRL_A",
      displayName: "CTRL_A",
      slug: "CTRL_A"
    });
    expect(result.rows[1].normalized.srcDevice).toEqual({
      originalName: "Control-A",
      normalizedName: "CTRL_A",
      displayName: "Control A",
      slug: "CTRL_A"
    });
    expect(result.rows[0].normalized.srcPort.slug).toBe("LAN1");
    expect(result.rows[1].normalized.srcPort.slug).toBe("LAN1");
    expect(result.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ALIAS_APPLIED",
          field: "srcDevice",
          rowId: "R002",
          originalName: "Control-A",
          normalizedName: "CTRL_A"
        })
      ])
    );
  });

  test("warns when different display names resolve to the same normalized name", () => {
    const result = normalizeInterfaceRows(rows, {
      devices: {
        CTRL_A: { normalizedName: "CTRL_A", displayName: "Control A" },
        "Control-A": { normalizedName: "CTRL_A", displayName: "控制板A" }
      }
    });

    expect(result.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DISPLAY_NAME_CONFLICT",
          severity: "warning",
          normalizedName: "CTRL_A"
        })
      ])
    );
  });
});
