import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import {
  registerAuthRoutes,
  logAuthStatus,
  isSsoEnabled,
  getAuthMode,
  demoBannerMiddleware,
} from "./auth";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createHash } from "crypto";

const PgSession = connectPgSimple(session);

// Global error handlers to prevent crashes from worker processes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.message && error.message.includes('tesseract')) {
    console.error('Tesseract worker error caught - continuing operation');
    return; // Don't crash the process for Tesseract errors
  }
  // For other uncaught exceptions, we might want to crash
  console.error('Fatal error, exiting process');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && typeof reason === 'object' && 'message' in reason && 
      typeof reason.message === 'string' && reason.message.includes('tesseract')) {
    console.error('Tesseract worker rejection caught - continuing operation');
    return; // Don't crash the process for Tesseract errors
  }
});

const app = express();

// Trust the nginx reverse proxy so Express sees the correct protocol,
// IP, and host from X-Forwarded-* headers. Required for secure cookies
// to work correctly when the app is behind nginx.
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Log auth/SSO status on startup
  logAuthStatus();

  // Register authentication routes (local/ldap/oidc per AUTH_MODE)
  registerAuthRoutes(app);

  // Register API routes
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
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
    log(`serving on port ${port}`);
  });
})();
