import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/server");
const page = await readFile(resolve(root, "index.html"), "utf8");

await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "page.js"), `export default ${JSON.stringify(page)};\n`);
await copyFile(resolve(root, "worker/index.js"), resolve(out, "index.js"));
