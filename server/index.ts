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
import MemoryStore from "memorystore";
import MssqlStoreFactory from "connect-mssql-v2";
import { createHash } from "crypto";
import { restrictDefaultUserApiAccess } from "./restrictedUserPolicy";
import { startBulkDataArchiveScheduler } from "./bulkDataArchives";
import { db } from "./db";
import { sql } from "drizzle-orm";

const PgSession = connectPgSimple(session);
const MemSession = MemoryStore(session);
const APP_START = Date.now();

// Detect database type from environment
const isSQLiteMode =
  process.env.DB_TYPE === "sqlite" ||
  (process.env.DATABASE_URL?.startsWith("sqlite:") ?? false);

const isMSSQLMode =
  process.env.DB_TYPE === "mssql" ||
  (process.env.DATABASE_URL?.startsWith("mssql://") ?? false) ||
  /^Server\s*=/i.test(process.env.DATABASE_URL ?? "");

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

// Session configuration
// • PostgreSQL / Neon → connect-pg-simple  (persisted, survives restarts)
// • SQL Server        → connect-mssql-v2   (persisted, survives restarts)
// • SQLite            → memorystore        (in-process; sessions lost on restart)
let sessionStore: session.Store | undefined;

if (isMSSQLMode) {
  const { parseMssqlUrl } = await import("./db-mssql");
  const mssqlCfg = parseMssqlUrl(process.env.DATABASE_URL!);
  // connect-mssql-v2 extends session.Store directly — pass config as first arg.
  sessionStore = new (MssqlStoreFactory as any)(mssqlCfg) as session.Store;
} else if (isSQLiteMode) {
  sessionStore = new MemSession({ checkPeriod: 86_400_000 });
} else if (process.env.DATABASE_URL) {
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
  });
}

// Distinct cookie name per auth mode so production and demo sessions never clash.
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
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Demo mode: auto-inject a guest user so the app runs without login.
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
  logAuthStatus();

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
  // ── Health / availability endpoint ────────────────────────────────────────
  // Polled by ELK Heartbeat / uptime monitors.
  // Returns 200 when healthy, 503 when the DB is unreachable.
  app.get("/api/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      // db unreachable — still respond so the caller gets a 503 not a timeout
    }
    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({
      status,
      uptime: Math.floor((Date.now() - APP_START) / 1000),
      db: dbOk ? "ok" : "unreachable",
      timestamp: new Date().toISOString(),
    });
  });

  const server = await registerRoutes(app);
  startBulkDataArchiveScheduler();

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

    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = 5000;
  // SO_REUSEPORT is not supported on Windows; Node throws ENOTSUP when the
  // option is set there. Keep it enabled on Linux (Docker/production) so
  // multiple workers can share the port.
  const reusePort = process.platform !== "win32";
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort,
  }, () => {
    log(`serving on port ${port}`, "express", { authMode: getAuthMode(), port });
  });
})();
