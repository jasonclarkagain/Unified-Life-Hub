import { Router, type IRouter } from "express";
import { getConnectors } from "../lib/connectors";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

// ─── GET /api/devops/repos ────────────────────────────────────────────────────
router.get("/devops/repos", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  const repos: unknown[] = [];

  try {
    const ghRes = await connectors.proxy("github", "/user/repos?per_page=30&sort=updated", { method: "GET" });
    const ghData = await ghRes.json() as unknown[];
    if (Array.isArray(ghData)) {
      for (const r of ghData as Record<string, unknown>[]) {
        repos.push({
          id: `github:${r["id"]}`,
          name: r["name"],
          fullName: r["full_name"],
          provider: "github",
          url: r["html_url"],
          description: r["description"] ?? null,
          stars: r["stargazers_count"] ?? 0,
          openIssues: r["open_issues_count"] ?? 0,
          updatedAt: r["updated_at"],
        });
      }
    }
  } catch (err) {
    req.log.warn({ err }, "GitHub repos fetch failed");
  }

  try {
    const glRes = await connectors.proxy("gitlab", "/api/v4/projects?membership=true&per_page=20&order_by=last_activity_at", { method: "GET" });
    const glData = await glRes.json() as unknown[];
    if (Array.isArray(glData)) {
      for (const r of glData as Record<string, unknown>[]) {
        repos.push({
          id: `gitlab:${r["id"]}`,
          name: r["name"],
          fullName: r["path_with_namespace"],
          provider: "gitlab",
          url: r["web_url"],
          description: r["description"] ?? null,
          stars: r["star_count"] ?? 0,
          openIssues: r["open_issues_count"] ?? 0,
          updatedAt: r["last_activity_at"],
        });
      }
    }
  } catch (err) {
    req.log.warn({ err }, "GitLab repos fetch failed");
  }

  res.json(repos);
});

// ─── GET /api/devops/repo-activity ───────────────────────────────────────────
router.get("/devops/repo-activity", async (req, res): Promise<void> => {
  const { repoId, provider } = req.query as { repoId: string; provider: string };
  if (!repoId || !provider) {
    res.status(400).json({ error: "repoId and provider are required" });
    return;
  }

  const connectors = getConnectors();
  const activity = { repoId, commits: [] as unknown[], pullRequests: [] as unknown[], issues: [] as unknown[] };

  if (provider === "github") {
    const parts = repoId.replace("github:", "").split(":");
    const fullName = parts[0] ?? repoId;
    try {
      const [commitsRes, prsRes, issuesRes] = await Promise.all([
        connectors.proxy("github", `/repos/${fullName}/commits?per_page=10`, { method: "GET" }),
        connectors.proxy("github", `/repos/${fullName}/pulls?state=open&per_page=10`, { method: "GET" }),
        connectors.proxy("github", `/repos/${fullName}/issues?state=open&per_page=10`, { method: "GET" }),
      ]);
      const commits = await commitsRes.json() as Record<string, unknown>[];
      const prs = await prsRes.json() as Record<string, unknown>[];
      const issues = await issuesRes.json() as Record<string, unknown>[];

      if (Array.isArray(commits)) {
        activity.commits = commits.map((c) => ({
          sha: (c["sha"] as string)?.slice(0, 8),
          message: ((c["commit"] as Record<string, unknown>)?.["message"] as string)?.split("\n")[0] ?? "",
          author: ((c["commit"] as Record<string, unknown>)?.["author"] as Record<string, unknown>)?.["name"] ?? "unknown",
          date: ((c["commit"] as Record<string, unknown>)?.["author"] as Record<string, unknown>)?.["date"] ?? "",
        }));
      }
      if (Array.isArray(prs)) {
        activity.pullRequests = prs.map((p) => ({
          id: p["number"],
          title: p["title"],
          state: p["state"],
          author: (p["user"] as Record<string, unknown>)?.["login"] ?? "unknown",
          url: p["html_url"],
          createdAt: p["created_at"],
        }));
      }
      if (Array.isArray(issues)) {
        activity.issues = (issues as Record<string, unknown>[])
          .filter((i) => !(i["pull_request"]))
          .map((i) => ({
            id: i["number"],
            title: i["title"],
            state: i["state"],
            author: (i["user"] as Record<string, unknown>)?.["login"] ?? "unknown",
            url: i["html_url"],
            createdAt: i["created_at"],
          }));
      }
    } catch (err) {
      req.log.warn({ err }, "GitHub activity fetch failed");
    }
  }

  res.json(activity);
});

// ─── GET /api/devops/figma/files ─────────────────────────────────────────────
router.get("/devops/figma/files", async (_req, res): Promise<void> => {
  const files = [
    { key: "demo-file-1", name: "Design System v2", lastModified: new Date().toISOString(), thumbnailUrl: null },
    { key: "demo-file-2", name: "Dashboard Wireframes", lastModified: new Date(Date.now() - 86400000).toISOString(), thumbnailUrl: null },
    { key: "demo-file-3", name: "Mobile App Screens", lastModified: new Date(Date.now() - 172800000).toISOString(), thumbnailUrl: null },
  ];
  res.json(files);
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function toBase64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

interface ScaffoldFile { path: string; content: string; description: string }
type Step = { name: string; status: "success" | "failed" | "skipped"; detail: string | null };

async function pushFileToGitHub(
  connectors: ReturnType<typeof getConnectors>,
  owner: string,
  repoName: string,
  file: ScaffoldFile
): Promise<void> {
  await connectors.proxy("github", `/repos/${owner}/${repoName}/contents/${file.path}`, {
    method: "PUT",
    body: JSON.stringify({ message: `scaffold: add ${file.path}`, content: toBase64(file.content) }),
    headers: { "Content-Type": "application/json" },
  });
}

async function getGitHubUser(connectors: ReturnType<typeof getConnectors>): Promise<string> {
  const r = await connectors.proxy("github", "/user", { method: "GET" });
  const d = await r.json() as Record<string, unknown>;
  return String(d["login"] ?? "unknown");
}

// Google Drive: find or create a folder by name under a parent (null = root)
async function findOrCreateDriveFolder(
  connectors: ReturnType<typeof getConnectors>,
  name: string,
  parentId?: string
): Promise<string> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}`);
  const listRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { method: "GET" });
  const listData = await listRes.json() as Record<string, unknown>;
  const existing = ((listData["files"] as Record<string, unknown>[]) ?? [])[0];
  if (existing?.["id"]) return String(existing["id"]);

  // Create the folder
  const createRes = await connectors.proxy("google-drive", "/drive/v3/files", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
    headers: { "Content-Type": "application/json" },
  });
  const createData = await createRes.json() as Record<string, unknown>;
  return String(createData["id"] ?? "");
}

// Google Drive: upload a text file using multipart upload
async function uploadToDrive(
  connectors: ReturnType<typeof getConnectors>,
  filename: string,
  content: string,
  mimeType: string,
  parentId?: string
): Promise<string> {
  const boundary = "aether_boundary_" + Date.now();
  const metadata: Record<string, unknown> = { name: filename, mimeType };
  if (parentId) metadata["parents"] = [parentId];

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    body,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
  });
  const uploadData = await uploadRes.json() as Record<string, unknown>;
  return String(uploadData["webViewLink"] ?? uploadData["id"] ?? "");
}

// OneDrive: upload file to AETHER-OS Deployments folder
async function uploadToOneDrive(
  connectors: ReturnType<typeof getConnectors>,
  filename: string,
  content: string,
  mimeType: string
): Promise<string> {
  const path = encodeURIComponent(`AETHER-OS Deployments/${filename}`);
  const uploadRes = await connectors.proxy("onedrive", `/v1.0/me/drive/root:/${path}:/content`, {
    method: "PUT",
    body: content,
    headers: { "Content-Type": mimeType },
  });
  const uploadData = await uploadRes.json() as Record<string, unknown>;
  return String(uploadData["webUrl"] ?? "");
}

// Generate the HTML Project Brief
function buildProjectBrief(opts: {
  componentName: string;
  repoName: string;
  repoUrl: string;
  framework: string;
  filesCreated: { path: string; description: string; size?: number }[];
  steps: Step[];
  qualityAudit: { issuesFound: number; issuesFixed: number; auditSummary: string; corrections: string[] };
  smsSent: number;
  generatedAt: string;
}): string {
  const { componentName, repoName, repoUrl, framework, filesCreated, steps, qualityAudit, smsSent, generatedAt } = opts;
  const fileRows = filesCreated.map(f =>
    `<tr><td><code>${f.path}</code></td><td>${f.description}</td><td>${f.size ?? "-"}B</td></tr>`
  ).join("\n");
  const stepRows = steps.map(s => {
    const color = s.status === "success" ? "#10b981" : s.status === "failed" ? "#ef4444" : "#6b7280";
    return `<tr><td style="color:${color};font-weight:bold">${s.status.toUpperCase()}</td><td>${s.name}</td><td>${s.detail ?? ""}</td></tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>AETHER-OS Project Brief: ${repoName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e2e8f0; margin: 0; padding: 40px; }
  h1 { color: #00e5ff; font-size: 2rem; margin-bottom: 4px; }
  h2 { color: #a78bfa; font-size: 1.1rem; border-bottom: 1px solid #1e1e2e; padding-bottom: 8px; margin-top: 32px; }
  .badge { display: inline-block; background: #1e1e2e; border: 1px solid #2e2e4e; border-radius: 4px; padding: 2px 10px; font-size: 0.8rem; margin-right: 8px; }
  .meta { color: #64748b; font-size: 0.85rem; margin-bottom: 24px; }
  a { color: #00e5ff; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #1e1e2e; }
  td { padding: 6px 8px; border-bottom: 1px solid #0f0f1a; vertical-align: top; }
  .quality { background: #0f1a0f; border: 1px solid #10b98130; border-radius: 6px; padding: 16px; margin-top: 8px; }
  .footer { color: #374151; font-size: 0.75rem; margin-top: 48px; text-align: center; }
</style>
</head>
<body>
<h1>⚡ AETHER-OS PROJECT BRIEF</h1>
<div class="meta">
  Generated: ${generatedAt} &nbsp;|&nbsp;
  <span class="badge">${framework.toUpperCase()}</span>
  <span class="badge">${filesCreated.length} files</span>
  ${smsSent > 0 ? `<span class="badge">${smsSent} SMS sent</span>` : ""}
</div>

<h2>Repository</h2>
<p><strong>${repoName}</strong> &mdash; <a href="${repoUrl}">${repoUrl}</a></p>
<p>Scaffolded from Figma component: <strong>${componentName}</strong></p>

<h2>Quality Audit</h2>
<div class="quality">
  <p><strong>${qualityAudit.issuesFound}</strong> issues found &mdash; <strong>${qualityAudit.issuesFixed}</strong> auto-corrected</p>
  <p>${qualityAudit.auditSummary}</p>
  ${qualityAudit.corrections.length > 0 ? `<ul>${qualityAudit.corrections.map(c => `<li>${c}</li>`).join("")}</ul>` : ""}
</div>

<h2>Repository Structure (${filesCreated.length} files)</h2>
<table>
  <tr><th>Path</th><th>Description</th><th>Size</th></tr>
  ${fileRows}
</table>

<h2>Execution Trace</h2>
<table>
  <tr><th>Status</th><th>Step</th><th>Detail</th></tr>
  ${stepRows}
</table>

<div class="footer">Generated by AETHER-OS Unified Intelligence Dashboard</div>
</body>
</html>`;
}

// ─── POST /api/devops/figma/scaffold ─────────────────────────────────────────
router.post("/devops/figma/scaffold", async (req, res): Promise<void> => {
  const {
    fileKey,
    componentName,
    framework = "react",
    repoName: requestedRepoName,
    phoneNumbers = [],
  } = req.body as {
    fileKey: string;
    componentName: string;
    framework?: string;
    repoName?: string | null;
    phoneNumbers?: string[];
  };

  if (!fileKey || !componentName) {
    res.status(400).json({ error: "fileKey and componentName are required" });
    return;
  }

  const steps: Step[] = [];
  let repoUrl: string | null = null;
  let finalRepoName: string | null = null;
  let filesCreated: { path: string; description: string; size: number }[] = [];
  let smsSent = 0;
  let qualityAudit = { issuesFound: 0, issuesFixed: 0, auditSummary: "Not run", corrections: [] as string[] };
  let storageSyncDrive: string | null = null;
  let storageSyncOneDrive: string | null = null;

  // ── Step 1: Gemini — generate project structure ───────────────────────────
  let projectFiles: ScaffoldFile[] = [];

  try {
    const prompt = `You are an expert software architect. A Figma design file named "${componentName}" (key: ${fileKey}) is being scaffolded into a ${framework} project.

Analyze the implied UI architecture from the component name and generate a complete, production-ready project structure.

Return ONLY a JSON object with this exact shape:
{
  "projectName": "kebab-case-name",
  "description": "One sentence describing the project",
  "architecture": "2-3 sentences describing the architecture decisions",
  "techStack": ["list", "of", "technologies"],
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "description": "What this file does",
      "content": "full file content here"
    }
  ]
}

Include these files at minimum:
1. README.md — with project overview, architecture, tech stack, setup instructions, and directory tree
2. package.json — with name, version, scripts (dev, build, test), and dependencies for ${framework} + TypeScript + Tailwind CSS + Bun runtime.
   CRITICAL: The "start" and "dev" scripts MUST use PORT=0 (e.g. "start": "PORT=0 bun run src/index.tsx") so the OS dynamically assigns the first available port, preventing "Address already in use" errors when running multiple scaffolds simultaneously.
3. bun.lockb — placeholder file (write the string "# bun lockfile v0" as content)
4. tsconfig.json — strict TypeScript config for ${framework}
5. src/index.tsx or src/main.tsx — application entry point. The server MUST bind to process.env.PORT || 0 (never hardcode a port number).
6. src/components/${componentName}.tsx — the main scaffolded component with TypeScript props interface, Tailwind CSS styling, proper accessibility
7. src/components/${componentName}.test.tsx — unit tests using Bun test runner
8. src/styles/globals.css — Tailwind CSS base styles
9. .github/workflows/ci.yml — CI pipeline: install (bun install), typecheck, test, build. Include a step to log "PORT=0 verified" confirming dynamic port usage.

Make all file contents complete and production-ready. Never hardcode port numbers.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 16384, responseMimeType: "application/json" },
    });

    const raw = response.text ?? "{}";
    const parsed = JSON.parse(raw) as {
      projectName?: string;
      description?: string;
      architecture?: string;
      techStack?: string[];
      files?: ScaffoldFile[];
    };

    projectFiles = (parsed.files ?? []).filter((f) => f.path && f.content);
    finalRepoName = requestedRepoName?.trim() ||
      (parsed.projectName ?? componentName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);

    steps.push({
      name: "Gemini AI Analysis",
      status: "success",
      detail: `Generated ${projectFiles.length} files · Stack: ${(parsed.techStack ?? []).join(", ")}`,
    });
  } catch (err) {
    req.log.error({ err }, "Gemini scaffold generation failed");
    steps.push({ name: "Gemini AI Analysis", status: "failed", detail: err instanceof Error ? err.message : "Unknown error" });
    res.status(500).json({ componentName, framework, repoUrl: null, filesCreated: [], smsSent: 0, steps, code: null, repoName: null, qualityAudit, storageSyncDrive: null, storageSyncOneDrive: null });
    return;
  }

  // ── Step 2: Gemini Quality Gate ───────────────────────────────────────────
  try {
    // Send key files to audit (package.json + main component + CI)
    const auditTargets = projectFiles
      .filter(f => ["package.json", ".github/workflows/ci.yml", `src/components/${componentName}.tsx`].some(t => f.path.includes(t)))
      .map(f => `=== ${f.path} ===\n${f.content.slice(0, 3000)}`)
      .join("\n\n");

    const auditPrompt = `You are a security and code quality auditor. Inspect the following generated project files and identify issues.

WHITELIST — treat these as safe and never flag or remove them:
- Any string beginning with "process.env." (e.g. process.env.PORT, process.env.DATABASE_URL) — these are runtime environment references, not secrets
- Any identifier beginning with "NEXT_PUBLIC_" (e.g. NEXT_PUBLIC_API_URL) — these are intentionally public build-time variables
- Any identifier beginning with "VITE_" (e.g. VITE_API_BASE) — these are intentionally public Vite build variables
- Import.meta.env.* references — same as above, public build-time values
- Placeholder comment strings like "# your key here" or "YOUR_VALUE_HERE" inside comments only

Only flag as HARDCODED SECRETS: raw entropy-heavy string literals (e.g. "sk-abc123...", "ghp_XYZ...") or strings whose variable name contains KEY, SECRET, TOKEN, PASSWORD, or CREDENTIAL and whose value is a non-empty, non-placeholder raw string (not process.env.* or an env reference).

Check for:
1. HARDCODED SECRETS — raw API keys, tokens, passwords embedded as string literals (see whitelist above)
2. REDUNDANT TAILWIND — duplicate or conflicting CSS class combinations
3. PACKAGE VERSION CONFLICTS — dependencies that are incompatible or pinned to insecure versions
4. SECURITY VULNERABILITIES — eval(), innerHTML, dangerouslySetInnerHTML without sanitization
5. MISSING REQUIRED FIELDS — package.json missing "type", "engines", or "license"

Files to audit:
${auditTargets}

Return ONLY a JSON object:
{
  "issuesFound": <integer>,
  "issuesFixed": <integer>,
  "auditSummary": "<one paragraph summary of findings and fixes>",
  "corrections": ["<description of each fix applied>"],
  "correctedFiles": [
    { "path": "<file path>", "content": "<full corrected file content>" }
  ]
}

If no issues found, return issuesFound: 0, issuesFixed: 0, empty arrays, and a clean bill of health summary.
Apply all fixes directly and return the corrected file contents in correctedFiles.`;

    const auditResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20",
      contents: [{ role: "user", parts: [{ text: auditPrompt }] }],
      config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const auditRaw = auditResponse.text ?? "{}";
    const auditParsed = JSON.parse(auditRaw) as {
      issuesFound?: number;
      issuesFixed?: number;
      auditSummary?: string;
      corrections?: string[];
      correctedFiles?: { path: string; content: string }[];
    };

    qualityAudit = {
      issuesFound: auditParsed.issuesFound ?? 0,
      issuesFixed: auditParsed.issuesFixed ?? 0,
      auditSummary: auditParsed.auditSummary ?? "Audit complete.",
      corrections: auditParsed.corrections ?? [],
    };

    // Merge corrected files back into projectFiles
    if (Array.isArray(auditParsed.correctedFiles)) {
      for (const corrected of auditParsed.correctedFiles) {
        const idx = projectFiles.findIndex(f => f.path === corrected.path);
        if (idx >= 0 && corrected.content) {
          projectFiles[idx] = { ...projectFiles[idx], content: corrected.content };
        }
      }
    }

    steps.push({
      name: "Security & Quality Gate",
      status: "success",
      detail: `${qualityAudit.issuesFound} issues found, ${qualityAudit.issuesFixed} auto-corrected. ${qualityAudit.auditSummary.slice(0, 120)}`,
    });
  } catch (err) {
    req.log.warn({ err }, "Quality gate failed — using unaudited files");
    steps.push({ name: "Security & Quality Gate", status: "failed", detail: "Audit skipped — proceeding with unaudited files" });
  }

  // ── Step 3: Create GitHub repo ────────────────────────────────────────────
  const connectors = getConnectors();
  let ownerLogin = "";

  try {
    ownerLogin = await getGitHubUser(connectors);
    const createRes = await connectors.proxy("github", "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: finalRepoName,
        description: `AI-scaffolded from Figma: ${componentName}`.slice(0, 255),
        private: false,
        auto_init: false,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const createData = await createRes.json() as Record<string, unknown>;
    if (createData["html_url"]) {
      repoUrl = String(createData["html_url"]);
      steps.push({ name: "Create GitHub Repository", status: "success", detail: repoUrl });
    } else {
      const msg = String(createData["message"] ?? "Repo creation failed");
      if (msg.includes("already exists") || msg.includes("name already")) {
        finalRepoName = `${finalRepoName}-${Date.now()}`;
        const retry = await connectors.proxy("github", "/user/repos", {
          method: "POST",
          body: JSON.stringify({ name: finalRepoName, private: false, auto_init: false }),
          headers: { "Content-Type": "application/json" },
        });
        const retryData = await retry.json() as Record<string, unknown>;
        if (retryData["html_url"]) {
          repoUrl = String(retryData["html_url"]);
          steps.push({ name: "Create GitHub Repository", status: "success", detail: repoUrl });
        } else {
          steps.push({ name: "Create GitHub Repository", status: "failed", detail: "Name conflict could not be resolved" });
        }
      } else {
        steps.push({ name: "Create GitHub Repository", status: "failed", detail: msg });
      }
    }
  } catch (err) {
    req.log.error({ err }, "GitHub repo creation failed");
    steps.push({ name: "Create GitHub Repository", status: "failed", detail: err instanceof Error ? err.message : "Unknown" });
  }

  // ── Step 4: Push audited files to GitHub ──────────────────────────────────
  if (repoUrl && ownerLogin && finalRepoName) {
    const pushed: string[] = [];
    const failed: string[] = [];

    for (const file of projectFiles) {
      try {
        await pushFileToGitHub(connectors, ownerLogin, finalRepoName, file);
        pushed.push(file.path);
        filesCreated.push({
          path: file.path,
          description: file.description,
          size: Buffer.byteLength(file.content, "utf-8"),
        });
      } catch (err) {
        req.log.warn({ err, path: file.path }, "Failed to push file");
        failed.push(file.path);
      }
    }

    steps.push({
      name: "Push Audited Files to Repository",
      status: pushed.length > 0 ? "success" : "failed",
      detail: `${pushed.length} files committed${failed.length > 0 ? ` · ${failed.length} failed: ${failed.join(", ")}` : ""}`,
    });
  } else {
    steps.push({ name: "Push Audited Files to Repository", status: "skipped", detail: "Repo creation failed" });
  }

  // ── Step 5: Twilio SMS ─────────────────────────────────────────────────────
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];

  if (!accountSid || !authToken || !fromNumber || phoneNumbers.length === 0) {
    steps.push({
      name: "Send SMS Notifications",
      status: "skipped",
      detail: phoneNumbers.length === 0
        ? "No phone numbers provided"
        : "Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    });
  } else {
    const message = `[AETHER-OS] Scaffold complete: "${componentName}" → ${filesCreated.length} files committed. Audit: ${qualityAudit.issuesFixed} fixes applied. Repo: ${repoUrl ?? "pending"}`;
    for (const phone of phoneNumbers) {
      try {
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: phone, From: fromNumber, Body: message }).toString(),
          }
        );
        const td = await twilioRes.json() as Record<string, unknown>;
        if (td["sid"]) {
          smsSent++;
          steps.push({ name: `SMS → ${phone}`, status: "success", detail: `SID: ${td["sid"]}` });
        } else {
          steps.push({ name: `SMS → ${phone}`, status: "failed", detail: String(td["message"] ?? "Send failed") });
        }
      } catch (err) {
        steps.push({ name: `SMS → ${phone}`, status: "failed", detail: err instanceof Error ? err.message : "Unknown" });
      }
    }
  }

  // ── Step 6: Google Drive — save Project Brief ─────────────────────────────
  if (repoUrl && finalRepoName) {
    try {
      const brief = buildProjectBrief({
        componentName,
        repoName: finalRepoName,
        repoUrl,
        framework,
        filesCreated,
        steps: [...steps],
        qualityAudit,
        smsSent,
        generatedAt: new Date().toISOString(),
      });

      const aetherId = await findOrCreateDriveFolder(connectors, "AETHER-OS");
      const deploymentsId = await findOrCreateDriveFolder(connectors, "Deployments", aetherId);
      const briefFilename = `${finalRepoName}-brief-${Date.now()}.html`;
      storageSyncDrive = await uploadToDrive(connectors, briefFilename, brief, "text/html", deploymentsId);

      steps.push({
        name: "Google Drive — Project Brief",
        status: "success",
        detail: `Saved to AETHER-OS/Deployments/${briefFilename}${storageSyncDrive ? ` · ${storageSyncDrive}` : ""}`,
      });
    } catch (err) {
      req.log.warn({ err }, "Google Drive upload failed");
      steps.push({ name: "Google Drive — Project Brief", status: "failed", detail: err instanceof Error ? err.message : "Upload failed" });
    }

    // ── Step 7: OneDrive — archive README + package.json ─────────────────────
    const archiveFiles = projectFiles.filter(f => f.path === "README.md" || f.path === "package.json");
    const odResults: string[] = [];
    const odFailed: string[] = [];

    for (const f of archiveFiles) {
      try {
        const mimeType = f.path === "package.json" ? "application/json" : "text/markdown";
        const prefix = finalRepoName ?? componentName;
        const odFilename = `${prefix}-${f.path.replace(/\//g, "-")}`;
        const odUrl = await uploadToOneDrive(connectors, odFilename, f.content, mimeType);
        odResults.push(odUrl || odFilename);
      } catch (err) {
        req.log.warn({ err, path: f.path }, "OneDrive upload failed");
        odFailed.push(f.path);
      }
    }

    if (archiveFiles.length === 0) {
      steps.push({ name: "OneDrive — Archive", status: "skipped", detail: "README.md or package.json not found in generated files" });
    } else if (odFailed.length === archiveFiles.length) {
      storageSyncOneDrive = null;
      steps.push({ name: "OneDrive — Archive", status: "failed", detail: `All ${odFailed.length} uploads failed` });
    } else {
      storageSyncOneDrive = odResults[0] ?? null;
      steps.push({
        name: "OneDrive — Archive",
        status: "success",
        detail: `Archived ${odResults.length} files to OneDrive/AETHER-OS Deployments/${odFailed.length > 0 ? ` (${odFailed.length} failed)` : ""}`,
      });
    }
  } else {
    steps.push({ name: "Google Drive — Project Brief", status: "skipped", detail: "Repo not created" });
    steps.push({ name: "OneDrive — Archive", status: "skipped", detail: "Repo not created" });
  }

  res.json({
    componentName,
    framework,
    repoUrl,
    repoName: finalRepoName,
    filesCreated,
    smsSent,
    steps,
    code: null,
    qualityAudit,
    storageSyncDrive,
    storageSyncOneDrive,
  });
});

// ─── POST /api/devops/pr-health ───────────────────────────────────────────────
router.post("/devops/pr-health", async (req, res): Promise<void> => {
  const connectors = getConnectors();

  // Fetch open PRs across all GitHub repos (search API)
  let prs: Record<string, unknown>[] = [];
  try {
    const searchRes = await connectors.proxy("github", "/search/issues?q=type:pr+state:open&per_page=30&sort=updated", { method: "GET" });
    const searchData = await searchRes.json() as Record<string, unknown>;
    prs = (searchData["items"] as Record<string, unknown>[]) ?? [];
  } catch (err) {
    req.log.warn({ err }, "PR search failed");
  }

  if (prs.length === 0) {
    res.json({
      totalPrs: 0,
      summary: "No open pull requests found.",
      blocking: [],
      readyToMerge: [],
      failingCi: [],
      other: [],
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  // Gather PR check statuses for first 10 PRs (avoid rate limits)
  const prDetails = prs.slice(0, 20).map((p) => ({
    id: Number(p["number"]),
    title: String(p["title"] ?? ""),
    url: String(p["html_url"] ?? ""),
    author: String((p["user"] as Record<string, unknown>)?.["login"] ?? "unknown"),
    labels: ((p["labels"] as Record<string, unknown>[]) ?? []).map((l) => String(l["name"] ?? "")),
    draft: Boolean(p["draft"]),
    body: String(p["body"] ?? "").slice(0, 300),
    state: String(p["state"] ?? ""),
    repository: String((p["repository_url"] as string ?? "").split("/").slice(-1)[0] ?? "unknown"),
  }));

  // Gemini categorization
  try {
    const prJson = JSON.stringify(prDetails, null, 2);
    const prompt = `You are a senior engineering lead reviewing open pull requests. Analyze these ${prDetails.length} open PRs and categorize them:

PRs:
${prJson}

Categorize each PR into exactly ONE of these groups:
- "blocking" — blocking a release, has merge conflicts, breaking changes, or is a critical fix stalled
- "readyToMerge" — approved, CI passing (inferred from labels/title), no blockers, clean
- "failingCi" — title/labels suggest CI failures, test failures, or build errors
- "other" — everything else (in review, draft, needs discussion)

Also write a 2-3 sentence "Project Health" executive summary.

Return ONLY valid JSON:
{
  "summary": "<executive summary>",
  "blocking": [{ "id": <number>, "title": "<string>", "url": "<string>", "author": "<string>", "reason": "<why blocking>" }],
  "readyToMerge": [{ "id": <number>, "title": "<string>", "url": "<string>", "author": "<string>", "reason": "<why ready>" }],
  "failingCi": [{ "id": <number>, "title": "<string>", "url": "<string>", "author": "<string>", "reason": "<what's failing>" }],
  "other": [{ "id": <number>, "title": "<string>", "url": "<string>", "author": "<string>", "reason": "<status>" }]
}`;

    const aiRes = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(aiRes.text ?? "{}") as {
      summary?: string;
      blocking?: unknown[];
      readyToMerge?: unknown[];
      failingCi?: unknown[];
      other?: unknown[];
    };

    res.json({
      totalPrs: prs.length,
      summary: parsed.summary ?? `${prs.length} open pull requests analyzed.`,
      blocking: parsed.blocking ?? [],
      readyToMerge: parsed.readyToMerge ?? [],
      failingCi: parsed.failingCi ?? [],
      other: parsed.other ?? [],
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "PR health analysis failed");
    res.status(500).json({ error: "PR health analysis failed" });
  }
});

// ─── POST /api/devops/ci-health ──────────────────────────────────────────────
router.post("/devops/ci-health", async (req, res): Promise<void> => {
  const { repoFullName, deployUrl, phoneNumbers = [] } = req.body as {
    repoFullName: string;
    deployUrl?: string | null;
    phoneNumbers?: string[];
  };

  if (!repoFullName || !repoFullName.includes("/")) {
    res.status(400).json({ error: "repoFullName must be in owner/repo format" });
    return;
  }

  type CiStep = { name: string; status: "success" | "failed" | "skipped"; detail: string | null };
  const steps: CiStep[] = [];
  let ciStatus: "passing" | "failing" | "pending" | "unknown" = "unknown";
  let deployUrlStatus: number | null = null;
  let failureSummary: string | null = null;
  let geminiSuggestion: string | null = null;
  let smsSent = 0;
  const connectors = getConnectors();

  // ── Step 1: Fetch GitHub Actions runs ─────────────────────────────────────
  let failedJobLogs = "";
  let runHtmlUrl = "";
  try {
    const runsRes = await connectors.proxy("github", `/repos/${repoFullName}/actions/runs?per_page=5&event=push`, { method: "GET" });
    const runsData = await runsRes.json() as Record<string, unknown>;
    const runs = (runsData["workflow_runs"] as Record<string, unknown>[]) ?? [];

    if (runs.length === 0) {
      ciStatus = "unknown";
      steps.push({ name: "Fetch GitHub Actions", status: "skipped", detail: "No workflow runs found (repo may not have CI configured yet)" });
    } else {
      const latest = runs[0];
      runHtmlUrl = String(latest["html_url"] ?? "");
      const conclusion = String(latest["conclusion"] ?? "");
      const runStatus = String(latest["status"] ?? "");

      if (runStatus === "in_progress" || runStatus === "queued") {
        ciStatus = "pending";
        steps.push({ name: "Fetch GitHub Actions", status: "success", detail: `Latest run is ${runStatus} · ${runHtmlUrl}` });
      } else if (conclusion === "success") {
        ciStatus = "passing";
        steps.push({ name: "Fetch GitHub Actions", status: "success", detail: `CI passing ✓ · ${runHtmlUrl}` });
      } else if (conclusion === "failure" || conclusion === "timed_out") {
        ciStatus = "failing";
        // Fetch the failed jobs to get specific failure info
        const runId = String(latest["id"] ?? "");
        try {
          const jobsRes = await connectors.proxy("github", `/repos/${repoFullName}/actions/runs/${runId}/jobs`, { method: "GET" });
          const jobsData = await jobsRes.json() as Record<string, unknown>;
          const jobs = (jobsData["jobs"] as Record<string, unknown>[]) ?? [];
          const failedJobs = jobs.filter(j => String(j["conclusion"]) === "failure");

          for (const job of failedJobs.slice(0, 3)) {
            const steps2 = (job["steps"] as Record<string, unknown>[]) ?? [];
            const failedSteps = steps2.filter(s => String(s["conclusion"]) === "failure");
            const jobName = String(job["name"] ?? "");
            const failedStepNames = failedSteps.map(s => String(s["name"] ?? "")).join(", ");
            failureSummary = (failureSummary ? failureSummary + " | " : "") +
              `Job "${jobName}" failed at: ${failedStepNames || "unknown step"}`;
          }
          failedJobLogs = failureSummary ?? "CI run failed — no detailed step info available";
        } catch (_err) {
          failedJobLogs = `CI run ${conclusion} · Run ID: ${runId}`;
          failureSummary = failedJobLogs;
        }
        steps.push({ name: "Fetch GitHub Actions", status: "failed", detail: `CI ${conclusion} · ${failureSummary ?? ""} · ${runHtmlUrl}` });
      } else {
        ciStatus = "unknown";
        steps.push({ name: "Fetch GitHub Actions", status: "skipped", detail: `Run conclusion: ${conclusion || runStatus}` });
      }
    }
  } catch (err) {
    req.log.warn({ err }, "GitHub Actions fetch failed");
    steps.push({ name: "Fetch GitHub Actions", status: "failed", detail: err instanceof Error ? err.message : "Unknown error" });
  }

  // ── Step 2: Probe deploy URL for 5xx ──────────────────────────────────────
  let deployIs5xx = false;
  if (deployUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const probeRes = await fetch(deployUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "AETHER-OS/CI-Health-Check" },
      });
      clearTimeout(timeout);
      deployUrlStatus = probeRes.status;
      deployIs5xx = probeRes.status >= 500;

      steps.push({
        name: `Probe Deploy URL`,
        status: deployIs5xx ? "failed" : "success",
        detail: `HTTP ${probeRes.status} from ${deployUrl}${deployIs5xx ? " — 5xx error confirmed" : " — healthy"}`,
      });
    } catch (err) {
      steps.push({ name: "Probe Deploy URL", status: "failed", detail: `Unreachable: ${err instanceof Error ? err.message : "timeout"}` });
      deployIs5xx = true;
      deployUrlStatus = null;
    }
  } else {
    steps.push({ name: "Probe Deploy URL", status: "skipped", detail: "No deployUrl provided" });
  }

  // ── Step 3: Gemini diagnosis + fix suggestion ─────────────────────────────
  if (ciStatus === "failing" || deployIs5xx) {
    try {
      const context = [
        failureSummary ? `GitHub CI failure: ${failureSummary}` : null,
        deployUrl && deployUrlStatus != null ? `Deployment URL (${deployUrl}) returned HTTP ${deployUrlStatus}` : null,
        deployUrl && deployUrlStatus == null ? `Deployment URL (${deployUrl}) is unreachable` : null,
        runHtmlUrl ? `CI run: ${runHtmlUrl}` : null,
        `Repository: ${repoFullName}`,
      ].filter(Boolean).join("\n");

      const prompt = `You are a DevOps engineer diagnosing a CI/deployment failure.

Context:
${context}

Provide a concise diagnosis and fix in this exact JSON format:
{
  "diagnosis": "<1-2 sentences: what likely went wrong>",
  "fix": "<3-5 specific, actionable steps to resolve the issue>",
  "urgency": "critical|high|medium",
  "estimatedFixTime": "<e.g. 15 minutes>"
}

Be specific and practical. Reference the actual failure context.`;

      const aiRes = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 1024, responseMimeType: "application/json" },
      });

      const parsed = JSON.parse(aiRes.text ?? "{}") as {
        diagnosis?: string;
        fix?: string;
        urgency?: string;
        estimatedFixTime?: string;
      };

      geminiSuggestion = [
        parsed.diagnosis ? `DIAGNOSIS: ${parsed.diagnosis}` : null,
        parsed.fix ? `FIX: ${parsed.fix}` : null,
        parsed.urgency ? `URGENCY: ${parsed.urgency?.toUpperCase()}` : null,
        parsed.estimatedFixTime ? `ETA: ${parsed.estimatedFixTime}` : null,
      ].filter(Boolean).join("\n");

      steps.push({ name: "Gemini Fix Analysis", status: "success", detail: parsed.diagnosis ?? "Analysis complete" });
    } catch (err) {
      req.log.warn({ err }, "Gemini CI diagnosis failed");
      steps.push({ name: "Gemini Fix Analysis", status: "failed", detail: "Could not generate fix suggestion" });
    }
  } else {
    steps.push({ name: "Gemini Fix Analysis", status: "skipped", detail: "CI is passing — no analysis needed" });
  }

  // ── Step 4: Twilio SMS with diagnosis ─────────────────────────────────────
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];

  const shouldSendSms = phoneNumbers.length > 0 && (ciStatus === "failing" || deployIs5xx);

  if (!accountSid || !authToken || !fromNumber) {
    steps.push({
      name: "Send SMS Alert",
      status: "skipped",
      detail: "Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    });
  } else if (!shouldSendSms) {
    steps.push({
      name: "Send SMS Alert",
      status: "skipped",
      detail: phoneNumbers.length === 0
        ? "No phone numbers provided"
        : "CI is healthy — no alert needed",
    });
  } else {
    const failureLines = [
      `[AETHER-OS] CI FAILURE: ${repoFullName}`,
      failureSummary ? `Error: ${failureSummary.slice(0, 100)}` : null,
      deployIs5xx && deployUrl ? `Deploy: HTTP ${deployUrlStatus ?? "unreachable"} at ${deployUrl}` : null,
      runHtmlUrl ? `Run: ${runHtmlUrl}` : null,
      geminiSuggestion ? `\nFix: ${geminiSuggestion.slice(0, 200)}` : null,
    ].filter(Boolean).join("\n");

    for (const phone of phoneNumbers) {
      try {
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: phone, From: fromNumber, Body: failureLines.slice(0, 1600) }).toString(),
          }
        );
        const td = await twilioRes.json() as Record<string, unknown>;
        if (td["sid"]) {
          smsSent++;
          steps.push({ name: `SMS Alert → ${phone}`, status: "success", detail: `SID: ${td["sid"]}` });
        } else {
          steps.push({ name: `SMS Alert → ${phone}`, status: "failed", detail: String(td["message"] ?? "Send failed") });
        }
      } catch (err) {
        steps.push({ name: `SMS Alert → ${phone}`, status: "failed", detail: err instanceof Error ? err.message : "Unknown" });
      }
    }
  }

  res.json({ repoFullName, ciStatus, deployUrlStatus, failureSummary, geminiSuggestion, smsSent, steps });
});

// ─── GET /api/devops/summary ──────────────────────────────────────────────────
router.get("/devops/summary", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  let openPRs = 0;
  let openIssues = 0;
  const recentCommits = 0;
  let totalRepos = 0;

  try {
    const ghRes = await connectors.proxy("github", "/user/repos?per_page=30&sort=updated", { method: "GET" });
    const repos = await ghRes.json() as Record<string, unknown>[];
    if (Array.isArray(repos)) {
      totalRepos += repos.length;
      for (const r of repos) {
        openIssues += (r["open_issues_count"] as number) ?? 0;
      }
    }
  } catch (err) {
    req.log.warn({ err }, "GitHub summary fetch failed");
  }

  try {
    const prsRes = await connectors.proxy("github", "/search/issues?q=type:pr+state:open+author:@me&per_page=1", { method: "GET" });
    const prsData = await prsRes.json() as Record<string, unknown>;
    openPRs = (prsData["total_count"] as number) ?? 0;
  } catch (_err) {
    // ignore
  }

  res.json({ openPRs, openIssues, recentCommits, totalRepos, lastUpdated: new Date().toISOString() });
});

export default router;
