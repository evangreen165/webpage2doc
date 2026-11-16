import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, "content"), { recursive: true });
mkdirSync(path.join(dist, "background"), { recursive: true });

const esbuildConfig = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome114"],
  sourcemap: false,
};

await build({
  ...esbuildConfig,
  entryPoints: [path.join(root, "content", "content-script.ts")],
  outfile: path.join(dist, "content", "content-script.js"),
});

await build({
  ...esbuildConfig,
  entryPoints: [path.join(root, "background", "service-worker.ts")],
  outfile: path.join(dist, "background", "service-worker.js"),
});

execSync("npx vite build", { cwd: root, stdio: "inherit", shell: true });

cpSync(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
cpSync(path.join(root, "public", "icons"), path.join(dist, "icons"), { recursive: true });

console.log("[build] complete -> dist/");
