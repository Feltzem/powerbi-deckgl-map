// Runs scripts/browser-bench/entry.ts in headless Chromium (Playwright) and prints the results.
//   node scripts/browser-bench/run.cjs [rows=100000] [vertices=20] [segment=30000]
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require("playwright");

const [rows, vertices, segment] = [100000, 20, 30000].map((d, i) => Number(process.argv[2 + i] ?? d));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, ".tmp", "browser-bench");

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(__dirname, "entry.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: path.join(outDir, "bench.js"),
    define: { "import.meta.url": '"https://localhost/"' },
    logLevel: "warning",
  });
  fs.writeFileSync(path.join(outDir, "index.html"), '<!doctype html><script src="bench.js"></script>');
  const server = http
    .createServer((req, res) => {
      const file = path.join(outDir, req.url === "/" ? "index.html" : req.url.slice(1));
      res.writeHead(fs.existsSync(file) ? 200 : 404, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" });
      res.end(fs.existsSync(file) ? fs.readFileSync(file) : "");
    })
    .listen(0);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  const results = await page.evaluate(([r, v, s]) => window.runBench(r, v, s), [rows, vertices, segment]);
  console.log(`Chromium ${browser.version()}, ${rows.toLocaleString()} rows, ${segment.toLocaleString()}-row segments`);
  for (const r of results) {
    console.log(
      `${r.name.padEnd(24)} main thread only ${(r.mainOnlyMs / 1000).toFixed(2)} s | with ${r.workers} workers: ` +
        `${(r.workersTotalMs / 1000).toFixed(2)} s total, main thread busy ${(r.workersMainThreadMs / 1000).toFixed(2)} s | ` +
        `identical output: ${r.identical} (${r.paths.toLocaleString()} paths)\n${"".padEnd(26)}main thread phases (ms): ${JSON.stringify(r.phases)}`,
    );
  }
  await browser.close();
  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
