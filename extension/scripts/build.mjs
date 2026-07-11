import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, "dist");
const watch = process.argv.includes("--watch");

const entryPoints = {
  "background/index": "src/background/index.ts",
  "content/index": "src/content/index.ts",
  "popup/index": "src/popup/index.ts",
  "options/index": "src/options/index.ts",
};

// IIFE (not ESM) for every entry: MV3 service workers and classic
// content-script injection both run non-module scripts by default, and a
// single bundling format avoids two separate esbuild configs for what is
// otherwise identical output.
const buildOptions = {
  entryPoints,
  outdir: outDir,
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  sourcemap: true,
  logLevel: "info",
};

async function copyStaticFiles() {
  await mkdir(path.join(outDir, "popup"), { recursive: true });
  await mkdir(path.join(outDir, "options"), { recursive: true });
  await cp(path.join(rootDir, "src/popup/index.html"), path.join(outDir, "popup/index.html"));
  await cp(path.join(rootDir, "src/options/index.html"), path.join(outDir, "options/index.html"));

  const manifestRaw = await readFile(path.join(rootDir, "manifest.json"), "utf8");
  await writeFile(path.join(outDir, "manifest.json"), manifestRaw);
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    await copyStaticFiles();
    console.log("Watching for changes...");
  } else {
    await build(buildOptions);
    await copyStaticFiles();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
