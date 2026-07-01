/**
 * Production static file serving — no vite dependency.
 * Serves the pre-built client from dist/public and injects runtime config.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // index: false prevents express.static from serving index.html directly so
  // the catch-all handler below can inject runtime config into it first.
  app.use(express.static(distPath, { index: false }));

  // Fall through to index.html, injecting runtime config into window globals.
  const indexPath = path.resolve(distPath, "index.html");
  app.use("*", (_req, res) => {
    const demoPort = process.env.DEMO_PORT || "8080";
    // APP_BASE_PATH lets nginx serve the app under a sub-path (e.g. /demo)
    // by injecting a <base> tag so the browser resolves assets correctly.
    const basePath = process.env.APP_BASE_PATH || "";
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) return res.sendFile(indexPath);
      const baseTag = basePath ? `<base href="${basePath}/">` : "";
      const injected = html.replace(
        "<head>",
        `<head>${baseTag}<script>window.__DEMO_PORT__="${demoPort}";window.__APP_BASE_PATH__="${basePath}";</script>`
      );
      res.setHeader("Content-Type", "text/html");
      res.send(injected);
    });
  });
}
