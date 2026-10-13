import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(root, "dist");
if (
  !destination.startsWith(root + path.sep) ||
  path.basename(destination) !== "dist"
) {
  throw new Error("Build destination must be the project dist directory");
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ["index.html", "src", "assets"]) {
  await cp(path.join(root, name), path.join(destination, name), {
    recursive: true,
  });
}
await cp(
  path.join(root, "public/manifest.webmanifest"),
  path.join(destination, "manifest.webmanifest"),
);
await mkdir(path.join(destination, "assets/vendor"), { recursive: true });
await cp(
  path.join(root, "node_modules/@capacitor/core/dist/index.js"),
  path.join(destination, "assets/vendor/capacitor.js"),
);
console.log("Built Capacitor web assets in dist/");
