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

  app.use(express.static(distPath));

  // Fall through to index.html, injecting runtime config into window globals.
  const indexPath = path.resolve(distPath, "index.html");
  app.use("*", (_req, res) => {
    const demoPort = process.env.DEMO_PORT || "8080";
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) return res.sendFile(indexPath);
      const injected = html.replace(
        "<head>",
        `<head><script>window.__DEMO_PORT__="${demoPort}";</script>`
      );
      res.setHeader("Content-Type", "text/html");
      res.send(injected);
    });
  });
}
