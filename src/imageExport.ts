import { access, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GraphImageExportKind = "png" | "pdf";

export interface GraphImageExportOptions {
  enabled: boolean;
  png: boolean;
  pdf: boolean;
  width: number;
  height: number;
  browserPath?: string;
  userDataDir?: string;
}

export interface ChromeImageExportArgsOptions {
  svgPath: string;
  outputPath: string;
  width: number;
  height: number;
  userDataDir?: string;
}

export interface GraphImageExportResult {
  browserPath: string;
  pngPath?: string;
  pdfPath?: string;
}

export function defaultGraphImageExportOptions(): GraphImageExportOptions {
  return {
    enabled: false,
    png: true,
    pdf: true,
    width: 1800,
    height: 1100
  };
}

export function buildChromeImageExportArgs(kind: GraphImageExportKind, options: ChromeImageExportArgsOptions): string[] {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check"
  ];
  if (options.userDataDir) {
    args.push(`--user-data-dir=${options.userDataDir}`);
  }
  args.push(`--window-size=${options.width},${options.height}`);
  args.push(kind === "png" ? `--screenshot=${options.outputPath}` : `--print-to-pdf=${options.outputPath}`);
  args.push(pathToFileURL(options.svgPath).toString());
  return args;
}

export async function exportGraphImages(
  svgPath: string,
  outDir: string,
  options: Partial<GraphImageExportOptions> = {}
): Promise<GraphImageExportResult | undefined> {
  const config = { ...defaultGraphImageExportOptions(), ...options };
  if (!config.enabled) {
    return undefined;
  }

  const browserPath = config.browserPath ?? (await findBrowserExecutable());
  if (!browserPath) {
    throw new Error("No Chrome or Edge executable found for PNG/PDF graph export. Set NETDRAW_CHROME_PATH or pass --browser.");
  }

  const absoluteOutDir = resolve(outDir);
  const absoluteSvgPath = resolve(svgPath);
  await mkdir(absoluteOutDir, { recursive: true });
  const userDataDir = resolve(config.userDataDir ?? join(absoluteOutDir, ".chrome-image-export-profile"));
  const result: GraphImageExportResult = { browserPath };

  if (config.png) {
    const pngPath = join(absoluteOutDir, "graph.png");
    await runChromeExport(browserPath, "png", {
      svgPath: absoluteSvgPath,
      outputPath: pngPath,
      width: config.width,
      height: config.height,
      userDataDir
    });
    result.pngPath = pngPath;
  }

  if (config.pdf) {
    const pdfPath = join(absoluteOutDir, "graph.pdf");
    await runChromeExport(browserPath, "pdf", {
      svgPath: absoluteSvgPath,
      outputPath: pdfPath,
      width: config.width,
      height: config.height,
      userDataDir
    });
    result.pdfPath = pdfPath;
  }

  return result;
}

async function runChromeExport(browserPath: string, kind: GraphImageExportKind, options: ChromeImageExportArgsOptions): Promise<void> {
  await mkdir(dirname(options.outputPath), { recursive: true });
  await execFileAsync(browserPath, buildChromeImageExportArgs(kind, options), { windowsHide: true });
}

async function findBrowserExecutable(): Promise<string | undefined> {
  const candidates = [
    process.env.NETDRAW_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
