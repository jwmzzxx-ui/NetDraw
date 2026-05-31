import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { loadProjectRules, mergeProjectRules } from "../src/rulesConfig.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("rules config", () => {
  test("loads project rules from JSON and merges with defaults", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-rules-"));
    tempDirs.push(outDir);
    const rulesPath = join(outDir, "rules.json");
    await writeFile(
      rulesPath,
      JSON.stringify(
        {
          layout: {
            dx: 320,
            overridePositions: {
              "port:PART_A/CTRL_A/LAN1": { x: 1234, y: 567 }
            },
            edgeBendPoints: {
              "cable:CAB-001": [{ x: 300, y: 420 }]
            }
          },
          style: {
            netTypes: {
              COMM: { color: "#0055ff", lineStyle: "dashed", width: 4 }
            }
          },
          export: {
            fileBaseName: "cables-custom"
          },
          routing: {
            preferAStar: true
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const merged = mergeProjectRules(await loadProjectRules(rulesPath));

    expect(merged.layout.dx).toBe(320);
    expect(merged.layout.overridePositions?.["port:PART_A/CTRL_A/LAN1"]).toEqual({ x: 1234, y: 567 });
    expect(merged.layout.edgeBendPoints?.["cable:CAB-001"]).toEqual([{ x: 300, y: 420 }]);
    expect(merged.style.netTypes.COMM).toEqual(
      expect.objectContaining({ label: "COMM", color: "#0055ff", lineStyle: "dashed", width: 4 })
    );
    expect(merged.style.netTypes.AC.color).toBe("#d9480f");
    expect(merged.export.fileBaseName).toBe("cables-custom");
    expect(merged.routing.preferAStar).toBe(true);

    const raw = await readFile(rulesPath, "utf8");
    expect(raw).toContain("overridePositions");
  });
});
