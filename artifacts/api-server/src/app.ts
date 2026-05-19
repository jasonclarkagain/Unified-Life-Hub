import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireSession, handleLogin, handleLogout } from "./middleware/auth";

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  logger.error("SESSION_SECRET is not set — refusing to start");
  process.exit(1);
}

// ── CORS origin allowlist ─────────────────────────────────────────────────────
// In production, REPLIT_DOMAINS contains the comma-separated list of public
// domains assigned to this deployment. We allow only those origins plus the
// loopback address (used by the Replit proxy in development).
// If REPLIT_DOMAINS is not set (plain local dev), fall back to allowing the
// current host reflectively so development still works without extra config.
function buildCorsOrigin(): cors.CorsOptions["origin"] {
  const raw = process.env["REPLIT_DOMAINS"];
  if (!raw) {
    // Local development fallback: mirror the request origin (same as origin:true)
    // but log a warning so the operator notices in production logs.
    if (process.env["NODE_ENV"] === "production") {
      logger.warn("REPLIT_DOMAINS is not set in production — CORS origin is permissive");
    }
    return true;
  }

  const allowed = new Set(
    raw.split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .flatMap((d) => [`https://${d}`, `http://${d}`]),
  );

  return (origin, callback) => {
    // Same-origin / server-to-server requests have no Origin header
    if (!origin) { callback(null, true); return; }
    if (allowed.has(origin)) { callback(null, true); return; }
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  };
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: buildCorsOrigin(), credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }),
);

// Auth routes — public (no session required)
app.post("/api/auth/login", handleLogin);
app.post("/api/auth/logout", handleLogout);

// All other /api routes require an authenticated session
app.use("/api", requireSession, router);

export default app;
