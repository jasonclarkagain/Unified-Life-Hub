import { Router, type IRouter } from "express";
import { getConnectors } from "../lib/connectors";

const router: IRouter = Router();

function truncate(str: string, len: number): string {
  return str && str.length > len ? str.slice(0, len) + "…" : str;
}

// GET /api/storage/search
router.get("/storage/search", async (req, res): Promise<void> => {
  const { q, provider = "all" } = req.query as { q: string; provider?: string };
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  const connectors = getConnectors();
  const files: unknown[] = [];

  if (provider === "all" || provider === "google-drive") {
    try {
      const driveRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(`name contains '${q}'`)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,owners)&pageSize=15`, { method: "GET" });
      const driveData = await driveRes.json() as Record<string, unknown>;
      const driveFiles = (driveData["files"] as Record<string, unknown>[]) ?? [];
      for (const f of driveFiles) {
        const owners = f["owners"] as Record<string, unknown>[] ?? [];
        files.push({
          id: `drive:${f["id"]}`,
          name: truncate(String(f["name"] ?? ""), 80),
          provider: "google-drive",
          mimeType: String(f["mimeType"] ?? "application/octet-stream"),
          size: f["size"] ? parseInt(String(f["size"]), 10) : null,
          modifiedAt: String(f["modifiedTime"] ?? new Date().toISOString()),
          webViewLink: String(f["webViewLink"] ?? ""),
          ownerName: owners[0]?.["displayName"] ? String(owners[0]["displayName"]) : null,
        });
      }
    } catch (err) {
      req.log.warn({ err }, "Google Drive search failed");
    }
  }

  if (provider === "all" || provider === "onedrive") {
    try {
      const odRes = await connectors.proxy("onedrive", `/v1.0/me/drive/root/search(q='${encodeURIComponent(q)}')?$select=id,name,file,size,lastModifiedDateTime,webUrl,createdBy&$top=15`, { method: "GET" });
      const odData = await odRes.json() as Record<string, unknown>;
      const odFiles = (odData["value"] as Record<string, unknown>[]) ?? [];
      for (const f of odFiles) {
        const fileObj = f["file"] as Record<string, unknown> ?? {};
        const createdBy = f["createdBy"] as Record<string, unknown> ?? {};
        files.push({
          id: `onedrive:${f["id"]}`,
          name: truncate(String(f["name"] ?? ""), 80),
          provider: "onedrive",
          mimeType: String(fileObj["mimeType"] ?? "application/octet-stream"),
          size: f["size"] ? Number(f["size"]) : null,
          modifiedAt: String(f["lastModifiedDateTime"] ?? new Date().toISOString()),
          webViewLink: String(f["webUrl"] ?? ""),
          ownerName: (createdBy["user"] as Record<string, unknown>)?.["displayName"] ? String((createdBy["user"] as Record<string, unknown>)["displayName"]) : null,
        });
      }
    } catch (err) {
      req.log.warn({ err }, "OneDrive search failed");
    }
  }

  res.json(files);
});

// GET /api/storage/recent
router.get("/storage/recent", async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query["limit"] ?? "20"), 10);
  const connectors = getConnectors();
  const files: unknown[] = [];

  await Promise.allSettled([
    (async () => {
      const r = await connectors.proxy("google-drive", `/drive/v3/files?orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,owners)&pageSize=${Math.ceil(limit / 2)}`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      for (const f of (d["files"] as Record<string, unknown>[]) ?? []) {
        const owners = f["owners"] as Record<string, unknown>[] ?? [];
        files.push({
          id: `drive:${f["id"]}`,
          name: truncate(String(f["name"] ?? ""), 80),
          provider: "google-drive",
          mimeType: String(f["mimeType"] ?? ""),
          size: f["size"] ? parseInt(String(f["size"]), 10) : null,
          modifiedAt: String(f["modifiedTime"] ?? ""),
          webViewLink: String(f["webViewLink"] ?? ""),
          ownerName: owners[0]?.["displayName"] ? String(owners[0]["displayName"]) : null,
        });
      }
    })(),
    (async () => {
      const r = await connectors.proxy("onedrive", `/v1.0/me/drive/recent?$select=id,name,file,size,lastModifiedDateTime,webUrl&$top=${Math.ceil(limit / 2)}`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      for (const f of (d["value"] as Record<string, unknown>[]) ?? []) {
        const fileObj = f["file"] as Record<string, unknown> ?? {};
        files.push({
          id: `onedrive:${f["id"]}`,
          name: truncate(String(f["name"] ?? ""), 80),
          provider: "onedrive",
          mimeType: String(fileObj["mimeType"] ?? ""),
          size: f["size"] ? Number(f["size"]) : null,
          modifiedAt: String(f["lastModifiedDateTime"] ?? ""),
          webViewLink: String(f["webUrl"] ?? ""),
          ownerName: null,
        });
      }
    })(),
  ]);

  const sorted = (files as Record<string, unknown>[]).sort(
    (a, b) => new Date(b["modifiedAt"] as string).getTime() - new Date(a["modifiedAt"] as string).getTime()
  );

  res.json(sorted.slice(0, limit));
});

// GET /api/storage/stats
router.get("/storage/stats", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  let googleDriveFiles = 0;
  let oneDriveFiles = 0;
  let googleDriveUsedBytes: number | null = null;

  await Promise.allSettled([
    (async () => {
      const r = await connectors.proxy("google-drive", `/drive/v3/about?fields=storageQuota`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      const quota = d["storageQuota"] as Record<string, unknown> ?? {};
      googleDriveUsedBytes = quota["usage"] ? parseInt(String(quota["usage"]), 10) : null;
      // Count files
      const fr = await connectors.proxy("google-drive", `/drive/v3/files?pageSize=1&fields=nextPageToken,files(id)`, { method: "GET" });
      const fd = await fr.json() as Record<string, unknown>;
      googleDriveFiles = (fd["files"] as unknown[])?.length ?? 0;
    })(),
    (async () => {
      const r = await connectors.proxy("onedrive", `/v1.0/me/drive/root/children?$select=id&$top=1`, { method: "GET" });
      const d = await r.json() as Record<string, unknown>;
      oneDriveFiles = (d["value"] as unknown[])?.length ?? 0;
    })(),
  ]);

  res.json({
    googleDriveFiles,
    oneDriveFiles,
    totalFiles: googleDriveFiles + oneDriveFiles,
    googleDriveUsedBytes,
  });
});

export default router;
