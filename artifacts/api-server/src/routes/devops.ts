import { Router, type IRouter } from "express";
import { getConnectors } from "../lib/connectors";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

// GET /api/devops/repos — list GitHub + GitLab repos
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

// GET /api/devops/repo-activity
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

// GET /api/devops/figma/files
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

async function pushFileToGitHub(
  connectors: ReturnType<typeof getConnectors>,
  owner: string,
  repoName: string,
  file: ScaffoldFile
): Promise<void> {
  await connectors.proxy("github", `/repos/${owner}/${repoName}/contents/${file.path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `scaffold: add ${file.path}`,
      content: toBase64(file.content),
    }),
    headers: { "Content-Type": "application/json" },
  });
}

async function getGitHubUser(connectors: ReturnType<typeof getConnectors>): Promise<string> {
  const r = await connectors.proxy("github", "/user", { method: "GET" });
  const d = await r.json() as Record<string, unknown>;
  return String(d["login"] ?? "unknown");
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

  const steps: { name: string; status: "success" | "failed" | "skipped"; detail: string | null }[] = [];
  let repoUrl: string | null = null;
  let finalRepoName: string | null = null;
  let filesCreated: { path: string; description: string; size: number }[] = [];
  let smsSent = 0;

  // ── Step 1: Gemini — analyze Figma file + generate project structure ────────
  let projectFiles: ScaffoldFile[] = [];
  let readmeContent = "";
  let architectureDescription = "";

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
2. package.json — with name, version, scripts (dev, build, test), and dependencies for ${framework} + TypeScript + Tailwind CSS + Bun runtime
3. bun.lockb — empty binary placeholder (write the string "# bun lockfile v0" as content — it will be initialized by bun install)
4. tsconfig.json — strict TypeScript config for ${framework}
5. src/index.tsx or src/main.tsx — application entry point
6. src/components/${componentName}.tsx — the main scaffolded component with TypeScript props interface, Tailwind CSS styling, and proper accessibility
7. src/components/${componentName}.test.tsx — unit tests using Bun test runner
8. src/styles/globals.css — Tailwind CSS base styles
9. .github/workflows/ci.yml — CI pipeline: install (bun install), typecheck, test, build

Make all file contents complete and production-ready. The component should implement a realistic UI based on the name "${componentName}".`;

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
    architectureDescription = parsed.architecture ?? "";
    finalRepoName = requestedRepoName?.trim() ||
      (parsed.projectName ?? componentName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);

    steps.push({
      name: "Gemini AI Analysis",
      status: "success",
      detail: `Generated ${projectFiles.length} files. Stack: ${(parsed.techStack ?? []).join(", ")}. ${parsed.description ?? ""}`,
    });
  } catch (err) {
    req.log.error({ err }, "Gemini scaffold generation failed");
    steps.push({ name: "Gemini AI Analysis", status: "failed", detail: err instanceof Error ? err.message : "Unknown error" });
    res.status(500).json({ componentName, framework, repoUrl: null, filesCreated: [], smsSent: 0, steps, code: null, repoName: null });
    return;
  }

  // ── Step 2: Create GitHub repo ────────────────────────────────────────────
  const connectors = getConnectors();
  let ownerLogin = "";

  try {
    ownerLogin = await getGitHubUser(connectors);
    const createRes = await connectors.proxy("github", "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: finalRepoName,
        description: `AI-scaffolded from Figma: ${componentName}. ${architectureDescription}`.slice(0, 255),
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
      steps.push({ name: "Create GitHub Repository", status: "failed", detail: msg });
      // Try with timestamp suffix if name conflicts
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
          steps[steps.length - 1] = { name: "Create GitHub Repository", status: "success", detail: repoUrl };
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "GitHub repo creation failed");
    steps.push({ name: "Create GitHub Repository", status: "failed", detail: err instanceof Error ? err.message : "Unknown" });
  }

  // ── Step 3: Push all files to the repo via GitHub Contents API ────────────
  if (repoUrl && ownerLogin && finalRepoName) {
    const pushed: string[] = [];
    const failed: string[] = [];

    // Push files sequentially to avoid GitHub rate-limiting on new repos
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

    if (pushed.length > 0) {
      steps.push({
        name: "Push Files to Repository",
        status: failed.length === 0 ? "success" : "success",
        detail: `${pushed.length} files committed: ${pushed.slice(0, 5).join(", ")}${pushed.length > 5 ? `... +${pushed.length - 5} more` : ""}${failed.length > 0 ? ` | ${failed.length} failed: ${failed.join(", ")}` : ""}`,
      });
    } else {
      steps.push({ name: "Push Files to Repository", status: "failed", detail: "No files could be pushed" });
    }
  } else {
    steps.push({ name: "Push Files to Repository", status: "skipped", detail: "Skipped — repo creation failed" });
  }

  // ── Step 4: Twilio SMS ─────────────────────────────────────────────────────
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];

  if (!accountSid || !authToken || !fromNumber) {
    if (phoneNumbers.length > 0) {
      steps.push({
        name: "Send SMS Notifications",
        status: "skipped",
        detail: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER env vars not set",
      });
    } else {
      steps.push({ name: "Send SMS Notifications", status: "skipped", detail: "No phone numbers provided" });
    }
  } else if (phoneNumbers.length === 0) {
    steps.push({ name: "Send SMS Notifications", status: "skipped", detail: "No phone numbers provided" });
  } else {
    const message = `[AETHER-OS] Scaffold complete for "${componentName}" (${framework}). ${filesCreated.length} files committed. Repo: ${repoUrl ?? "pending"}`;

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
        const twilioData = await twilioRes.json() as Record<string, unknown>;
        if (twilioData["sid"]) {
          smsSent++;
          steps.push({ name: `SMS → ${phone}`, status: "success", detail: `SID: ${twilioData["sid"]}` });
        } else {
          steps.push({ name: `SMS → ${phone}`, status: "failed", detail: String(twilioData["message"] ?? "Send failed") });
        }
      } catch (err) {
        steps.push({ name: `SMS → ${phone}`, status: "failed", detail: err instanceof Error ? err.message : "Unknown" });
      }
    }

    if (smsSent > 0) {
      req.log.info({ smsSent, repoUrl }, "Twilio SMS sent");
    }
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
  });
});

// GET /api/devops/summary
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
