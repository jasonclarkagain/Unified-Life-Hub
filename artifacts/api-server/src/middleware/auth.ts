import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Session-based authentication middleware.
 *
 * Protected /api routes require an active session established via
 * POST /api/auth/login (password compared against API_SECRET_KEY).
 *
 * Exemptions (no session required):
 *   - GET  /api/healthz          — liveness probe
 *   - POST /api/auth/login       — creates the session
 *   - POST /api/auth/logout      — destroys the session (harmless without one)
 */

const PUBLIC_PATHS = new Set(["/healthz", "/auth/login", "/auth/logout"]);

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  if (!(req.session as { authenticated?: boolean }).authenticated) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}

// ── Login rate limiter ────────────────────────────────────────────────────────
// Tracks failed attempts per source IP. After MAX_ATTEMPTS failures within
// WINDOW_MS, the IP is locked out for LOCKOUT_MS.

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;  // 15 minutes

interface LoginRecord {
  attempts: number;
  windowStart: number;
  lockedUntil: number | null;
}

const loginRecords = new Map<string, LoginRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  let record = loginRecords.get(ip);

  if (!record) {
    record = { attempts: 0, windowStart: now, lockedUntil: null };
    loginRecords.set(ip, record);
  }

  if (record.lockedUntil !== null) {
    if (now < record.lockedUntil) {
      return { allowed: false, retryAfterSec: Math.ceil((record.lockedUntil - now) / 1000) };
    }
    // Lockout expired — reset
    record.attempts = 0;
    record.windowStart = now;
    record.lockedUntil = null;
  }

  // Reset window if it has expired
  if (now - record.windowStart > WINDOW_MS) {
    record.attempts = 0;
    record.windowStart = now;
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginRecords.get(ip);
  if (!record) return;

  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    logger.warn({ ip, attempts: record.attempts }, "Login rate limit: IP locked out");
  }
}

function recordSuccessfulLogin(ip: string): void {
  loginRecords.delete(ip);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function handleLogin(req: Request, res: Response): void {
  const apiKey = process.env["API_SECRET_KEY"];

  if (!apiKey) {
    logger.warn("API_SECRET_KEY is not set — login is disabled");
    res.status(503).json({ error: "Server authentication is not configured" });
    return;
  }

  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: "Too many login attempts — try again later",
      retryAfterSec: rateCheck.retryAfterSec,
    });
    return;
  }

  const { password } = req.body as { password?: string };

  if (!password || password !== apiKey) {
    recordFailedAttempt(ip);
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  recordSuccessfulLogin(ip);
  (req.session as { authenticated?: boolean }).authenticated = true;
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "Session save failed");
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({ ok: true });
  });
}

export function handleLogout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
}
