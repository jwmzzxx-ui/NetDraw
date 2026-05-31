import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { runSampleVerification, runSampleVerificationMatrix } from "../scripts/verify-samples.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("sample verification script", () => {
  test("accepts valid samples and expected invalid samples", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-samples-"));
    tempDirs.push(outDir);
    const validPath = join(outDir, "valid.csv");
    const duplicatePath = join(outDir, "duplicate-row.csv");
    const brokenRoutePath = join(outDir, "broken-route.csv");
    const routesPath = join(outDir, "routes.csv");

    await writeFile(
      validPath,
      [
        "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id",
        "R001,A,B1,P1,B,B2,P2,COMM,ethernet,C-001"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      duplicatePath,
      [
        "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id",
        "R001,A,B1,P1,B,B2,P2,COMM,ethernet,C-001",
        "R001,C,B3,P3,D,B4,P4,COMM,ethernet,C-002"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      brokenRoutePath,
      [
        "row_id,src_device,src_board,src_port,dst_device,dst_board,dst_port,net_type,medium,cable_id,route_hint",
        "R001,A,B1,P1,B,B2,P2,COMM,ethernet,C-001,SPL_A>CAB_3"
      ].join("\n"),
      "utf8"
    );
    await writeFile(routesPath, "from_route_node,to_route_node,cost\nSPL_A,PDU_1,1\n", "utf8");

    const results = await runSampleVerification({
      outRoot: join(outDir, "verified"),
      validCases: [{ name: "valid", inputPath: validPath }],
      expectedFailureCases: [
        { name: "duplicate", inputPath: duplicatePath, expectedMessage: "Duplicate row id" },
        { name: "broken-route", inputPath: brokenRoutePath, routesPath, expectedMessage: "No route path from SPL_A to CAB_3" }
      ]
    });

    expect(results).toEqual([
      expect.objectContaining({ name: "valid", status: "passed" }),
      expect.objectContaining({ name: "duplicate", status: "expected-failure" }),
      expect.objectContaining({ name: "broken-route", status: "expected-failure" })
    ]);
  });

  test("adds a real-sample slot and skips it when the fixture is not present", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "netdraw-samples-matrix-"));
    tempDirs.push(outDir);

    const report = await runSampleVerificationMatrix({
      outRoot: join(outDir, "verified"),
      realSamplePath: join(outDir, "missing-real.csv"),
      validCases: [{ name: "baseline", inputPath: "samples/interfaces.csv" }],
      expectedFailureCases: [{ name: "duplicate", inputPath: "samples/interfaces-duplicate-row.csv", expectedMessage: "Duplicate row id" }]
    });

    expect(report.summary).toEqual({
      passed: 1,
      expectedFailures: 1,
      failed: 0,
      skipped: 1
    });
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "real-small-sample", status: "skipped", group: "real-sample" }),
        expect.objectContaining({ name: "baseline", status: "passed", group: "sample-regression" }),
        expect.objectContaining({ name: "duplicate", status: "expected-failure", group: "anomaly" })
      ])
    );
  });
});
