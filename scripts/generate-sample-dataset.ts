import { join } from "node:path";
import { generateSampleDataset } from "../src/sampleDataset.js";

async function main(): Promise<void> {
  const outDir = getOutDir(process.argv.slice(2));
  const metadata = await generateSampleDataset({ outDir });

  console.log("NetDraw generated samples complete");
  console.log(`Output: ${outDir}`);
  console.log(`Rows: ${metadata.rowCount}`);
  console.log(`Route edges: ${metadata.routeEdgeCount}`);
  console.log(`Components: ${metadata.componentCount}`);
}

function getOutDir(args: string[]): string {
  const index = args.indexOf("--out");
  return index >= 0 && args[index + 1] ? args[index + 1] : join("samples", "generated");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
