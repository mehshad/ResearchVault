import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import {
  registerAuthRoutes,
  logAuthStatus,
  isSsoEnabled,
  getAuthMode,
  demoBannerMiddleware,
  refreshSessionAuthorization,
} from "./auth";
import { serveStatic } from "./static";
import { log, logError, logRequest } from "./logger";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createHash } from "crypto";
import { restrictDefaultUserApiAccess } from "./restrictedUserPolicy";
import { db } from "./db";
import { sql } from "drizzle-orm";

const PgSession = connectPgSimple(session);
const APP_START = Date.now();

// Global error handlers to prevent crashes from worker processes
process.on('uncaughtException', (error) => {
  const isTesseract = error.message?.includes('tesseract');
  logError('uncaughtException', 'process', error, { fatal: !isTesseract });
  if (isTesseract) return;
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const isTesseract =
    reason &&
    typeof reason === 'object' &&
    'message' in reason &&
    typeof (reason as any).message === 'string' &&
    (reason as any).message.includes('tesseract');
  logError('unhandledRejection', 'process', reason as Error, { fatal: false });
  if (isTesseract) return;
});

const app = express();

// Trust the nginx reverse proxy so Express sees the correct protocol,
// IP, and host from X-Forwarded-* headers. Required for secure cookies
// to work correctly when the app is behind nginx.
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

// When the app is served under a sub-path via nginx (e.g. /demo), nginx passes
// the full path. Strip the prefix here so all routes and static file serving
// work without any modification. nginx must NOT strip the prefix itself
// (no trailing slash on proxy_pass) for this to work correctly.
const appBasePath = (process.env.APP_BASE_PATH || "").replace(/\/$/, "");
if (appBasePath) {
  app.use((req, _res, next) => {
    if (req.url.startsWith(appBasePath)) {
      req.url = req.url.slice(appBasePath.length) || "/";
    }
    next();
  });
}

// Secure cookies require HTTPS. In production behind nginx without TLS
// (plain HTTP) we must keep secure: false or the browser will never
// send the cookie back and every request appears unauthenticated.
const isHttps = process.env.APP_URL?.startsWith('https://') ?? false;

// Session configuration — use PostgreSQL store in production to avoid
// MemoryStore leak warnings and to survive container restarts.
const sessionStore = process.env.DATABASE_URL
  ? new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    })
  : undefined; // falls back to default MemoryStore in dev without a DB

// Use a distinct cookie name per auth mode so the production app and the demo
// app (same hostname, different ports) never share or corrupt each other's
// sessions. Browsers scope cookies to hostname only — not port — so without
// distinct names, a demo cookie sent to the production app (or vice versa)
// would silently invalidate the user's real session.
const cookieName = getAuthMode() === 'demo' ? 'rv-demo.sid' : 'rv.sid';

app.use(session({
  name: cookieName,
  store: sessionStore,
  secret: process.env.SESSION_SECRET || createHash('sha256').update('research-portal-session-secret').digest('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Demo mode: auto-inject a guest user so the app runs without login.
// Also applies in development when AUTH_MODE is unset or "demo".
if (getAuthMode() === "demo") {
  app.use("/api", demoBannerMiddleware);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    if (req.path === "/api/health") return;

    const user = (req.session as any)?.user;
    logRequest({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      userId: user?.id ?? null,
      username: user?.username ?? null,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
      contentLength: res.getHeader("content-length") as number | undefined,
    });
  });

  next();
});

(async () => {
  // Log auth/SSO status on startup
  logAuthStatus();

  // Register authentication routes (local/ldap/oidc per AUTH_MODE)
  registerAuthRoutes(app);

  app.get("/api/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      // Return a response rather than timing out when the database is unavailable.
    }
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? "ok" : "degraded",
      uptime: Math.floor((Date.now() - APP_START) / 1000),
      db: dbOk ? "ok" : "unreachable",
      timestamp: new Date().toISOString(),
    });
  });

  // Refresh real authenticated principals from users before every application
  // API request so role changes take effect immediately and fail closed.
  app.use("/api", refreshSessionAuthorization);

  // Real accounts that still have the built-in "user" onboarding role are
  // denied by default. Only profile, registration, and ordinary publication
  // APIs are explicitly allowed. Demo mode is bypassed inside the middleware.
  app.use("/api", restrictDefaultUserApiAccess);

  // Register API routes
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const user = (req.session as any)?.user;

    logError("unhandled request error", "express", err, {
      method: req.method,
      path: req.path,
      statusCode: status,
      userId: user?.id ?? null,
      username: user?.username ?? null,
    });

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`, "express", { authMode: getAuthMode(), port });
  });
})();
