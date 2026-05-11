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

// GET /api/devops/repo-activity — commits, PRs, issues for a repo
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
router.get("/devops/figma/files", async (req, res): Promise<void> => {
  // Return placeholder Figma files — Figma MCP is available but requires per-request setup
  // In production this would use the Figma MCP mcpFigma_getMetadata
  const files = [
    { key: "demo-file-1", name: "Design System v2", lastModified: new Date().toISOString(), thumbnailUrl: null },
    { key: "demo-file-2", name: "Dashboard Wireframes", lastModified: new Date(Date.now() - 86400000).toISOString(), thumbnailUrl: null },
    { key: "demo-file-3", name: "Mobile App Screens", lastModified: new Date(Date.now() - 172800000).toISOString(), thumbnailUrl: null },
  ];
  res.json(files);
});

// POST /api/devops/figma/scaffold
router.post("/devops/figma/scaffold", async (req, res): Promise<void> => {
  const { fileKey, componentName, framework = "react" } = req.body as {
    fileKey: string;
    componentName: string;
    framework?: string;
  };

  if (!fileKey || !componentName) {
    res.status(400).json({ error: "fileKey and componentName are required" });
    return;
  }

  try {
    const prompt = `Generate a clean ${framework} component scaffold for a UI component named "${componentName}" from a Figma design.
Include: TypeScript props interface, styled with Tailwind CSS, proper accessibility attributes, and a default export.
Keep it concise and production-ready. Return only the code, no explanation.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });

    const code = response.text ?? `// ${componentName} component\nexport default function ${componentName}() {\n  return <div>${componentName}</div>;\n}`;
    res.json({ componentName, code, framework });
  } catch (err) {
    req.log.error({ err }, "Figma scaffold generation failed");
    res.status(500).json({ error: "Failed to generate scaffold" });
  }
});

// GET /api/devops/summary
router.get("/devops/summary", async (req, res): Promise<void> => {
  const connectors = getConnectors();
  let openPRs = 0;
  let openIssues = 0;
  let recentCommits = 0;
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

  res.json({
    openPRs,
    openIssues,
    recentCommits,
    totalRepos,
    lastUpdated: new Date().toISOString(),
  });
});

export default router;
