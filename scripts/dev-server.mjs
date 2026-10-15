import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(projectRoot, "public");
const port = 5174;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      // Public files are served at /; application source and assets retain their paths.
      const isApplicationFile =
        pathname === "/" ||
        pathname === "/index.html" ||
        pathname.startsWith("/src/") ||
        pathname.startsWith("/assets/");
      const isVendor = pathname === "/assets/vendor/mediabunny.mjs";
      const root = isVendor ? path.join(projectRoot, "node_modules/mediabunny") : isApplicationFile ? projectRoot : publicRoot;
      const file = isVendor ? path.join(root, "dist/bundles/mediabunny.min.mjs") : path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          mimeTypes[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      response.end(data);
    } catch {
      response.writeHead(404).end("Not found");
    }
  })
  .listen(port, "0.0.0.0", () =>
    console.log(`Local: http://localhost:${port}`),
  );
