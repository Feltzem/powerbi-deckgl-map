// Drives headless Chrome over the DevTools protocol to run the browser
// benchmarks. No extra dependencies: esbuild comes with tsx, the CDP client
// uses Node's built-in WebSocket, and Chrome is the locally installed one.
// DNS for every host except 127.0.0.1 is blocked, so nothing leaves the machine.
//
//   npm run bench:browser -- --mode both --label baseline
//   npm run bench:browser -- --mode e2e --scenarios hamilton:hamilton-crash-h3 --screenshots .tmp/benchmarks/screens/baseline

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { HAMILTON_SCENARIOS, syntheticScenarioId, syntheticSpecs } from "../datasets";

const repoRoot = process.cwd();
const outputRoot = path.join(repoRoot, ".tmp", "benchmarks");
const bundleDir = path.join(outputRoot, "browser");

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};
const hasFlag = (name: string) => process.argv.includes(name);

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((candidate): candidate is string => !!candidate);

const hamiltonKeys = HAMILTON_SCENARIOS.map((spec) => `hamilton:${spec.id}`);

const defaultStageKeys = [
  ...hamiltonKeys,
  ...syntheticSpecs().map((spec) => `synthetic:${syntheticScenarioId(spec)}`),
  "tiled:roads-x44",
];

const e2eSyntheticKinds = /^(scatter|line|arc|path-wkp|polygon-wkp|prism|mixed)-/;
const defaultE2EKeys = [
  ...hamiltonKeys,
  ...syntheticSpecs()
    .map((spec) => syntheticScenarioId(spec))
    .filter((id) => e2eSyntheticKinds.test(id))
    .map((id) => `synthetic:${id}`),
  "tiled:roads-x44",
];

const animationRuns = [
  { key: "hamilton:hamilton-earthquake-animation", objects: {} },
  ...["scatter-numeric-timed-100k", "scatter-numeric-timed-500k", "path-wkp-categorical-timed-100k"].map(
    (id) => ({
      key: `synthetic:${id}`,
      objects: {
        animationProps: { play: true, loop: true, speedMode: "duration", animationDuration: 30, trailLength: 2592000 },
      },
    }),
  ),
];

export const bundlePages = async () => {
  mkdirSync(bundleDir, { recursive: true });
  for (const entry of ["stages-page", "e2e-page"]) {
    await build({
      entryPoints: [path.join(repoRoot, "scripts", "benchmarks", "browser", `${entry}.ts`)],
      outfile: path.join(bundleDir, `${entry}.js`),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "chrome120",
      minify: true,
      sourcemap: false,
      // The WKP loader resolves its .wasm next to import.meta.url; the bytes
      // are passed in directly, so the page location is only a placeholder.
      define: { "process.env.NODE_ENV": '"production"', "import.meta.url": "location.href" },
      alias: {
        "powerbi-visuals-api": path.join(repoRoot, "scripts", "benchmarks", "browser", "powerbi-visuals-api-shim.ts"),
      },
      logLevel: "warning",
    });
  }
};

const pages: Record<string, string> = {
  "/stages.html": `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style>
<script>window.powerbi={visuals:{ValidatorType:{Min:"Min",Max:"Max"}}};</script></head>
<body><script src="/__bench/stages-page.js"></script></body></html>`,
  "/e2e.html": `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}</style>
<link rel="stylesheet" href="/__visual/visual.css">
<script>window.powerbi={visuals:{plugins:{}}};</script></head>
<body><script src="/__visual/visual.js"></script><script src="/__bench/e2e-page.js"></script></body></html>`,
};

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".csv": "text/csv",
  ".json": "application/json",
};

export const startServer = (visualDir: string) =>
  new Promise<{ port: number; close: () => void }>((resolve) => {
    const server = createServer((request, response) => {
      const url = { pathname: decodeURIComponent((request.url ?? "/").split("?")[0]) };
      let filePath: string | null = null;
      if (pages[url.pathname]) {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(pages[url.pathname]);
        return;
      }
      if (url.pathname.startsWith("/__bench/")) {
        filePath = path.join(bundleDir, path.basename(url.pathname));
      } else if (url.pathname.startsWith("/__visual/")) {
        filePath = path.join(visualDir, path.basename(url.pathname));
      } else if (url.pathname.startsWith("/samples/hamilton/")) {
        filePath = path.join(repoRoot, "samples", "hamilton", path.basename(url.pathname));
      }
      if (!filePath || !existsSync(filePath)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
      });
      response.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    });
  });

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private listeners: Array<(message: any) => void> = [];

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const callbacks = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) {
          callbacks.reject(new Error(`${message.error.message} ${message.error.data ?? ""}`));
        } else {
          callbacks.resolve(message.result);
        }
        return;
      }
      for (const listener of this.listeners) {
        listener(message);
      }
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new CdpClient(socket)));
      socket.addEventListener("error", () => reject(new Error(`CDP connection failed: ${url}`)));
    });
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  onEvent(listener: (message: any) => void) {
    this.listeners.push(listener);
  }

  close() {
    this.socket.close();
  }
}

export const launchChrome = async (headed: boolean) => {
  const chromePath = CHROME_PATHS.find((candidate) => existsSync(candidate));
  if (!chromePath) {
    throw new Error("Chrome not found; set CHROME_PATH");
  }
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "deckgl-bench-"));
  const args = [
    ...(headed ? [] : ["--headless=new"]),
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    "--window-size=1280,800",
    "--force-device-scale-factor=1",
    "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
    "about:blank",
  ];
  const child = spawn(chromePath, args, { stdio: "ignore" });
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 20000;
  while (!existsSync(portFile) || readFileSync(portFile, "utf8").split("\n").length < 2) {
    if (Date.now() > deadline) {
      throw new Error("Chrome did not start");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const [port, browserPath] = readFileSync(portFile, "utf8").trim().split("\n");
  const client = await CdpClient.connect(`ws://127.0.0.1:${port}${browserPath}`);
  const version = await client.send("Browser.getVersion");
  return {
    client,
    version: version.product as string,
    close: async () => {
      client.close();
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        console.warn(`[browser] could not remove ${userDataDir}: ${error}`);
      }
    },
  };
};

export const openPage = async (client: CdpClient, url: string) => {
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Page.enable", {}, sessionId);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  await client.send("Page.navigate", { url }, sessionId);
  const evaluate = async (expression: string) => {
    const response = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  };
  const deadline = Date.now() + 30000;
  while (!(await evaluate("window.benchReady === true").catch(() => false))) {
    if (Date.now() > deadline) {
      throw new Error(`Page did not become ready: ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    evaluate,
    screenshot: async (filePath: string) => {
      const { data } = await client.send("Page.captureScreenshot", { format: "png" }, sessionId);
      writeFileSync(filePath, Buffer.from(data, "base64"));
    },
    close: () => client.send("Target.closeTarget", { targetId }),
  };
};

const main = async () => {
  const mode = argValue("--mode", "both");
  const label = argValue("--label", "working-tree");
  const visualDir = path.resolve(argValue("--visual-dir", path.join(repoRoot, ".tmp", "drop")));
  const filter = new RegExp(argValue("--filter", "."));
  const repeat = Number(argValue("--repeat", "3"));
  const animateMs = Number(argValue("--animate-ms", "5000"));
  const screenshotDir = argValue("--screenshots", "");
  const explicitKeys = argValue("--scenarios", "");

  if ((mode === "e2e" || mode === "both") && !existsSync(path.join(visualDir, "visual.js"))) {
    throw new Error(`No visual.js in ${visualDir}; run pbiviz package first`);
  }

  await bundlePages();
  const server = await startServer(visualDir);
  const chrome = await launchChrome(hasFlag("--headed"));
  const origin = `http://127.0.0.1:${server.port}`;
  chrome.client.onEvent((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      console.warn("[page exception]", message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
    }
  });

  const output: Record<string, unknown> = {
    label,
    environment: "chrome",
    browser: chrome.version,
    cpu: os.cpus()[0]?.model,
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    startedAt: new Date().toISOString(),
  };

  try {
    if (mode === "stages" || mode === "both") {
      const keys = (explicitKeys ? explicitKeys.split(",") : defaultStageKeys).filter((key) => filter.test(key));
      const results = [];
      for (const key of keys) {
        const started = Date.now();
        const page = await openPage(chrome.client, `${origin}/stages.html`);
        try {
          const result = await page.evaluate(`window.benchStages.run(${JSON.stringify(key)})`);
          results.push(result);
          const parse = result.stages.find((stage: any) => stage.stage === "parse.total");
          console.log(`[browser stages] ${key}: parse ${parse?.medianMs?.toFixed(1)} ms [${((Date.now() - started) / 1000).toFixed(1)} s]`);
        } catch (error) {
          console.warn(`[browser stages] ${key} failed: ${error}`);
          results.push({ id: key, error: String(error) });
        } finally {
          await page.close();
        }
      }
      output.stages = results;
    }

    if (mode === "e2e" || mode === "both") {
      const keys = (explicitKeys ? explicitKeys.split(",") : defaultE2EKeys).filter((key) => filter.test(key));
      const runs: Array<{ key: string; objects: Record<string, unknown>; animate: boolean }> = [
        ...keys.map((key) => ({ key, objects: {}, animate: false })),
        ...(explicitKeys || screenshotDir ? [] : animationRuns.filter((run) => filter.test(run.key)).map((run) => ({ ...run, animate: true }))),
      ];
      const results = [];
      if (screenshotDir) {
        mkdirSync(screenshotDir, { recursive: true });
      }
      for (const run of runs) {
        const samples = [];
        const iterations = screenshotDir ? 1 : repeat;
        for (let iteration = 0; iteration < iterations; iteration += 1) {
          const page = await openPage(chrome.client, `${origin}/e2e.html`);
          try {
            const objects = screenshotDir
              ? { ...run.objects, animationProps: { play: false } }
              : run.objects;
            const result = await page.evaluate(
              `window.benchE2E.run(${JSON.stringify(run.key)}, ${JSON.stringify({ objects, animateMs: run.animate ? animateMs : 0 })})`,
            );
            if (!output.gpu) {
              output.gpu = await page.evaluate("window.benchE2E.info()");
            }
            if (screenshotDir) {
              const fileName = `${run.key.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.png`;
              await page.screenshot(path.join(screenshotDir, fileName));
            }
            samples.push(result);
          } catch (error) {
            console.warn(`[browser e2e] ${run.key} failed: ${error}`);
            samples.push({ id: run.key, error: String(error) });
          } finally {
            await page.evaluate("window.benchE2E.destroy()").catch(() => undefined);
            await page.close();
          }
        }
        const ok = samples.filter((sample: any) => !sample.error);
        const firstDraws = ok.map((sample: any) => sample.firstDrawGpuSyncedMs).sort((a, b) => a - b);
        console.log(
          `[browser e2e] ${run.key}${run.animate ? " (animated)" : ""}: first draw ${firstDraws.map((value) => value.toFixed(0)).join(", ")} ms`,
        );
        results.push({ key: run.key, animate: run.animate, samples });
      }
      output.e2e = results;
    }
  } finally {
    server.close();
    await chrome.close();
  }

  const outputDir = path.join(outputRoot, "browser-results");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `chrome-${mode}-${label}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[browser] wrote ${outputPath}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
