/**
 * Development-only Vite middleware.
 * This file is ONLY imported via dynamic import() when NODE_ENV=development,
 * so the `vite` package is never resolved in production builds.
 */
import { createServer as createViteServer, createLogger } from "vite";
import { type Express } from "express";
import { type Server } from "http";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import viteConfig from "../vite.config";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      // Inject the same runtime globals that serveStatic() provides in
      // production. Without this the client falls back to its hard-coded
      // demo port (8080) during development, so the Demo link points at an
      // instance that does not exist on a single-instance dev machine.
      const demoPort = process.env.DEMO_PORT || "8080";
      const basePath = process.env.APP_BASE_PATH || "";
      const baseTag = basePath ? `<base href="${basePath}/">` : "";
      template = template.replace(
        "<head>",
        `<head>${baseTag}<script>window.__DEMO_PORT__="${demoPort}";window.__APP_BASE_PATH__="${basePath}";</script>`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
