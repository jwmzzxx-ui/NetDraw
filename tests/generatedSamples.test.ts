import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { parseComponentsCsv } from "../src/components.js";
import { parseInterfaceTableFile } from "../src/parser.js";
import { loadProjectRules } from "../src/rulesConfig.js";
import { parseRoutesCsv } from "../src/routing.js";
import {
  generateSampleDataset,
  generatedAnomalyFileNames,
  generatedMainSamplePaths
} from "../src/sampleDataset.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("generated importable samples", () => {
  test("creates the main sample bundle and anomaly files", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-generated-"));
    tempDirs.push(outDir);

    const metadata = await generateSampleDataset({ outDir });
    expect(metadata.rowCount).toBe(1200);
    expect(metadata.routeEdgeCount).toBeGreaterThan(0);
    expect(metadata.componentCount).toBeGreaterThan(0);

    const generatedMain = generatedMainSamplePaths(join(outDir, "main"));
    await expect(stat(generatedMain.interfacePath)).resolves.toBeTruthy();
    await expect(stat(generatedMain.routesPath)).resolves.toBeTruthy();
    await expect(stat(generatedMain.componentsPath)).resolves.toBeTruthy();
    await expect(stat(generatedMain.rulesPath)).resolves.toBeTruthy();

    for (const fileName of generatedAnomalyFileNames()) {
      await expect(stat(join(outDir, "anomalies", fileName))).resolves.toBeTruthy();
    }
  });

  test("ships a checked-in 1200 row sample bundle that is parser compatible", async () => {
    const generatedMain = generatedMainSamplePaths();
    const rows = await parseInterfaceTableFile(generatedMain.interfacePath);
    expect(rows).toHaveLength(1200);
    expect(new Set(rows.map((row) => row.netType))).toEqual(new Set(["AC", "DC", "COMM", "SIGNAL", "SAFETY"]));

    const routes = parseRoutesCsv(await readFile(generatedMain.routesPath, "utf8"));
    expect(routes.length).toBeGreaterThan(0);

    const components = parseComponentsCsv(await readFile(generatedMain.componentsPath, "utf8"));
    expect(components.length).toBeGreaterThan(0);

    const rules = await loadProjectRules(generatedMain.rulesPath);
    expect(rules.export?.fileBaseName).toBe("generated-sample-cables");
  });
});
