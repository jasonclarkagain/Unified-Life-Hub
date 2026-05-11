import { Router, type IRouter } from "express";
import { getConnectors } from "../lib/connectors";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Vibe → Spotify playlist keyword mapping
const VIBE_PLAYLISTS: Record<string, string> = {
  focus: "focus",
  meeting: "ambient",
  creative: "creative",
  break: "chill",
  standup: "morning",
  off: "",
};

// GET /api/environment/vibe
router.get("/environment/vibe", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  try {
    const r = await connectors.proxy("spotify", "/v1/me/player", { method: "GET" });
    if (r.status === 204) {
      res.json({ isPlaying: false, preset: "off", trackName: null, artistName: null, playlistName: null, playlistId: null });
      return;
    }
    const d = await r.json() as Record<string, unknown>;
    const track = d["item"] as Record<string, unknown> ?? {};
    const context = d["context"] as Record<string, unknown> ?? {};
    res.json({
      isPlaying: d["is_playing"] ?? false,
      preset: "focus",
      trackName: String(track["name"] ?? ""),
      artistName: ((track["artists"] as Record<string, unknown>[])?.[0]?.["name"]) ?? null,
      playlistName: null,
      playlistId: context["uri"] ? String(context["uri"]).split(":").pop() : null,
    });
  } catch (err) {
    req.log.warn({ err }, "Spotify player fetch failed");
    res.json({ isPlaying: false, preset: "off", trackName: null, artistName: null, playlistName: null, playlistId: null });
  }
});

// POST /api/environment/vibe/apply
router.post("/environment/vibe/apply", async (req, res): Promise<void> => {
  const { preset, playlistId } = req.body as { preset: string; playlistId?: string | null };
  const connectors = getConnectors();

  if (preset === "off") {
    try {
      await connectors.proxy("spotify", "/v1/me/player/pause", { method: "PUT" });
    } catch (_e) { /* ignore */ }
    res.json({ isPlaying: false, preset: "off", trackName: null, artistName: null, playlistName: null, playlistId: null });
    return;
  }

  let targetPlaylistId = playlistId;

  // If no playlist ID given, search for one by vibe keyword
  if (!targetPlaylistId) {
    try {
      const keyword = VIBE_PLAYLISTS[preset] ?? preset;
      const searchRes = await connectors.proxy("spotify", `/v1/search?q=${encodeURIComponent(keyword)}&type=playlist&limit=1`, { method: "GET" });
      const searchData = await searchRes.json() as Record<string, unknown>;
      const playlists = ((searchData["playlists"] as Record<string, unknown>)?.["items"] as Record<string, unknown>[]) ?? [];
      targetPlaylistId = playlists[0]?.["id"] ? String(playlists[0]["id"]) : undefined;
    } catch (err) {
      req.log.warn({ err }, "Spotify playlist search failed");
    }
  }

  if (targetPlaylistId) {
    try {
      await connectors.proxy("spotify", "/v1/me/player/play", {
        method: "PUT",
        body: JSON.stringify({ context_uri: `spotify:playlist:${targetPlaylistId}` }),
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      req.log.warn({ err }, "Spotify playback start failed");
    }
  }

  res.json({
    isPlaying: true,
    preset,
    trackName: null,
    artistName: null,
    playlistName: VIBE_PLAYLISTS[preset] ?? preset,
    playlistId: targetPlaylistId ?? null,
  });
});

// GET /api/environment/calendar
router.get("/environment/calendar", async (req, res): Promise<void> => {
  const days = parseInt(String(req.query["days"] ?? "7"), 10);
  const connectors = getConnectors();
  try {
    const now = new Date();
    const end = new Date(now.getTime() + days * 86400000);
    const r = await connectors.proxy(
      "outlook",
      `/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$select=id,subject,start,end,location,isOnlineMeeting,organizer&$top=20`,
      { method: "GET" }
    );
    const d = await r.json() as Record<string, unknown>;
    const events = (d["value"] as Record<string, unknown>[]) ?? [];
    res.json(events.map((e) => ({
      id: String(e["id"]),
      subject: String(e["subject"] ?? "(no subject)"),
      start: (e["start"] as Record<string, unknown>)?.["dateTime"] ?? "",
      end: (e["end"] as Record<string, unknown>)?.["dateTime"] ?? "",
      location: (e["location"] as Record<string, unknown>)?.["displayName"] ?? null,
      isOnlineMeeting: e["isOnlineMeeting"] ?? false,
      organizer: ((e["organizer"] as Record<string, unknown>)?.["emailAddress"] as Record<string, unknown>)?.["name"] ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Outlook calendar fetch failed");
    res.json([]);
  }
});

// GET /api/environment/spotify/playlists
router.get("/environment/spotify/playlists", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  try {
    const r = await connectors.proxy("spotify", "/v1/me/playlists?limit=20", { method: "GET" });
    const d = await r.json() as Record<string, unknown>;
    const items = (d["items"] as Record<string, unknown>[]) ?? [];
    res.json(items.map((p) => ({
      id: String(p["id"]),
      name: String(p["name"]),
      description: p["description"] ? String(p["description"]) : null,
      trackCount: Number((p["tracks"] as Record<string, unknown>)?.["total"] ?? 0),
      imageUrl: ((p["images"] as Record<string, unknown>[])?.[0]?.["url"]) ? String((p["images"] as Record<string, unknown>[])[0]["url"]) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Spotify playlists fetch failed");
    res.json([]);
  }
});

// GET /api/environment/health-checks — return cached/recent checks
const healthCheckCache: Record<string, unknown>[] = [];

router.get("/environment/health-checks", async (_req, res): Promise<void> => {
  // Return cached results or seeded defaults
  if (healthCheckCache.length === 0) {
    healthCheckCache.push(
      { id: "hc-1", url: "https://example.com", status: "unknown", statusCode: null, responseTimeMs: null, checkedAt: new Date().toISOString(), error: null },
      { id: "hc-2", url: "https://httpbin.org/status/200", status: "unknown", statusCode: null, responseTimeMs: null, checkedAt: new Date().toISOString(), error: null },
    );
  }
  res.json(healthCheckCache);
});

// POST /api/environment/health-checks/run
router.post("/environment/health-checks/run", async (req, res): Promise<void> => {
  const { url } = req.body as { url: string };
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const id = `hc-${Date.now()}`;
  const checkedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, { signal: controller.signal, method: "HEAD" }).catch(() =>
      fetch(url, { signal: controller.signal })
    );
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    const result = {
      id,
      url,
      status: r.ok ? "healthy" : r.status >= 500 ? "down" : "degraded",
      statusCode: r.status,
      responseTimeMs,
      checkedAt,
      error: null,
    };
    healthCheckCache.unshift(result as Record<string, unknown>);
    if (healthCheckCache.length > 50) healthCheckCache.pop();
    res.json(result);
  } catch (err) {
    const result = {
      id,
      url,
      status: "down",
      statusCode: null,
      responseTimeMs: Date.now() - start,
      checkedAt,
      error: err instanceof Error ? err.message : "Request failed",
    };
    healthCheckCache.unshift(result as Record<string, unknown>);
    logger.warn({ err }, "Health check failed");
    res.json(result);
  }
});

export default router;
