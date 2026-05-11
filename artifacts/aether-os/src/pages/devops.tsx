import {
  useListRepos,
  useListFigmaFiles,
  useScaffoldFromFigma,
  useFetchRepoActivity,
  useCheckCiHealth,
  FigmaScaffold,
  WorkflowStepStatus,
  CiHealthResult,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiGithub, SiGitlab, SiFigma } from "react-icons/si";
import {
  GitCommit,
  GitPullRequest,
  AlertCircle,
  Zap,
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  FolderOpen,
  MessageSquare,
  X,
  Loader2,
  ShieldAlert,
  Wifi,
  WifiOff,
  ActivitySquare,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Repo Activity Sub-panel ──────────────────────────────────────────────────

function RepoActivityPanel({ repoId, provider }: { repoId: string; provider: "github" | "gitlab" }) {
  const { data: activity, isLoading } = useFetchRepoActivity({ repoId, provider });

  if (isLoading) return <Skeleton className="h-28 w-full mt-3" />;
  if (!activity) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {activity.commits.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
            <GitCommit className="w-3 h-3" /> Recent Commits
          </h4>
          {activity.commits.slice(0, 3).map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-accent/5 rounded px-2 py-1 text-xs">
              <span className="truncate pr-3 text-foreground">{c.message}</span>
              <span className="font-mono text-muted-foreground shrink-0">{c.sha.slice(0, 7)}</span>
            </div>
          ))}
        </div>
      )}
      {activity.pullRequests.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
            <GitPullRequest className="w-3 h-3" /> Open PRs
          </h4>
          {activity.pullRequests.slice(0, 2).map((pr) => (
            <div key={pr.id} className="flex items-center gap-2 text-xs text-foreground bg-accent/5 rounded px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="truncate">{pr.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CI Health Monitor Panel ──────────────────────────────────────────────────

function CiMonitorPanel({ repoName }: { repoName: string }) {
  const { toast } = useToast();
  const ciMutation = useCheckCiHealth();

  const [deployUrl, setDeployUrl] = useState("");
  const [phones, setPhones] = useState("");
  const [result, setResult] = useState<CiHealthResult | null>(null);

  const handleCheck = () => {
    const phoneNumbers = phones.split(",").map((s) => s.trim()).filter(Boolean);
    ciMutation.mutate(
      {
        data: {
          repoFullName: repoName,
          deployUrl: deployUrl.trim() || null,
          phoneNumbers,
        },
      },
      {
        onSuccess: (data) => {
          setResult(data);
          if (data.ciStatus === "failing" || (data.deployUrlStatus != null && data.deployUrlStatus >= 500)) {
            toast({ title: "CI_FAILURE_DETECTED", description: "Gemini has analyzed the issue", variant: "destructive" });
          }
        },
        onError: () => {
          toast({ title: "CI Check Failed", description: "Could not reach the API", variant: "destructive" });
        },
      }
    );
  };

  const statusIcon = (s: WorkflowStepStatus) => {
    if (s === "success") return <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />;
    if (s === "failed") return <XCircle className="w-3 h-3 text-destructive shrink-0" />;
    return <Clock className="w-3 h-3 text-muted-foreground shrink-0" />;
  };

  const ciStatusConfig = {
    passing: { label: "PASSING", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: <CheckCircle2 className="w-4 h-4" /> },
    failing: { label: "FAILING", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: <XCircle className="w-4 h-4" /> },
    pending: { label: "PENDING", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: <Clock className="w-4 h-4" /> },
    unknown: { label: "UNKNOWN", color: "text-muted-foreground", bg: "bg-accent/10 border-border", icon: <ActivitySquare className="w-4 h-4" /> },
  };

  return (
    <div className="mt-5 border-t border-border pt-5 space-y-4">
      <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-primary" />
        CI_HEALTH_MONITOR
      </h3>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] text-muted-foreground">DEPLOY_URL (optional — probe for 5xx)</Label>
          <Input
            placeholder="https://my-app.example.com"
            value={deployUrl}
            onChange={(e) => setDeployUrl(e.target.value)}
            className="bg-background border-border font-mono text-xs h-8"
            data-testid="input-ci-deploy-url"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] text-muted-foreground">SMS_ALERT (comma-separated phones — optional)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="+1234567890"
              value={phones}
              onChange={(e) => setPhones(e.target.value)}
              className="bg-background border-border font-mono text-xs h-8 flex-1"
              data-testid="input-ci-phones"
            />
            <Button
              size="sm"
              onClick={handleCheck}
              disabled={ciMutation.isPending}
              className="font-mono text-xs h-8 shrink-0"
              data-testid="button-check-ci-health"
            >
              {ciMutation.isPending ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />CHECKING...</>
              ) : (
                <><ActivitySquare className="w-3 h-3 mr-1.5" />CHECK_CI</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          {/* CI Status badge row */}
          <div className="flex items-center gap-3 flex-wrap">
            {(() => {
              const cfg = ciStatusConfig[result.ciStatus] ?? ciStatusConfig.unknown;
              return (
                <div className={`flex items-center gap-2 border rounded-md px-3 py-1.5 font-mono text-xs ${cfg.color} ${cfg.bg}`}>
                  {cfg.icon}
                  CI: {cfg.label}
                </div>
              );
            })()}
            {result.deployUrlStatus != null && (
              <div className={`flex items-center gap-2 border rounded-md px-3 py-1.5 font-mono text-xs ${
                result.deployUrlStatus >= 500
                  ? "text-destructive bg-destructive/10 border-destructive/30"
                  : result.deployUrlStatus >= 200 && result.deployUrlStatus < 300
                  ? "text-green-500 bg-green-500/10 border-green-500/30"
                  : "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
              }`}>
                {result.deployUrlStatus >= 500 ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                HTTP: {result.deployUrlStatus}
              </div>
            )}
            {result.smsSent > 0 && (
              <div className="flex items-center gap-2 border border-primary/30 rounded-md px-3 py-1.5 font-mono text-xs text-primary bg-primary/10">
                <Phone className="w-3.5 h-3.5" />
                {result.smsSent} SMS sent
              </div>
            )}
          </div>

          {/* Gemini suggestion */}
          {result.geminiSuggestion && (
            <div className="bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1">
              <div className="text-[10px] font-mono text-primary uppercase tracking-widest flex items-center gap-1.5 mb-2">
                <Zap className="w-3 h-3" /> GEMINI_FIX_SUGGESTION
              </div>
              <pre className="text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed">
                {result.geminiSuggestion}
              </pre>
            </div>
          )}

          {/* Execution steps */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Telemetry Steps</div>
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="mt-0.5">{statusIcon(step.status as WorkflowStepStatus)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-foreground">{step.name}</span>
                  {step.detail && (
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all leading-relaxed">{step.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scaffold Result Panel ────────────────────────────────────────────────────

function ScaffoldResult({ result, onClose }: { result: FigmaScaffold; onClose: () => void }) {
  const statusIcon = (status: WorkflowStepStatus) => {
    if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
    if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  };

  const succeeded = result.steps.filter((s) => s.status === "success").length;
  const total = result.steps.length;

  // Determine repoFullName from the repoUrl if possible
  const repoFullName = result.repoUrl
    ? result.repoUrl.replace("https://github.com/", "")
    : result.repoName ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-[0_0_40px_rgba(0,255,255,0.1)] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-accent/5 rounded-t-lg">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-mono font-bold text-white">SCAFFOLD_COMPLETE</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {succeeded}/{total} steps succeeded · {result.filesCreated?.length ?? 0} files committed
                {(result.smsSent ?? 0) > 0 && ` · ${result.smsSent} SMS sent`}
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-muted-foreground">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Repo link */}
          {result.repoUrl && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <SiGithub className="w-4 h-4" />
                <span>{result.repoName ?? "Repository created"}</span>
              </div>
              <a
                href={result.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline font-mono"
              >
                OPEN_REPO <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Execution trace */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Execution Trace</h3>
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div className="mt-0.5">{statusIcon(step.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-foreground">{step.name}</div>
                  {step.detail && (
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono break-all leading-relaxed">
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* File tree */}
          {(result.filesCreated?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" /> Repository Structure
              </h3>
              <div className="bg-background rounded-md border border-border p-3 font-mono text-xs space-y-1 max-h-52 overflow-y-auto">
                {result.filesCreated?.map((f) => (
                  <div key={f.path} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="text-muted-foreground select-none">├─</span>
                      <span>{f.path}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px]">{f.description}</span>
                      {f.size != null && <span className="text-[10px]">{f.size}B</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMS status */}
          {(result.smsSent ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-400 font-mono bg-green-500/10 border border-green-500/20 rounded-md p-3">
              <MessageSquare className="w-4 h-4" />
              {result.smsSent} SMS notification{result.smsSent !== 1 ? "s" : ""} sent via Twilio
            </div>
          )}

          {/* ── CI Health Monitor — self-healing telemetry loop ── */}
          {repoFullName && repoFullName.includes("/") && (
            <CiMonitorPanel repoName={repoFullName} />
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button onClick={onClose} className="w-full font-mono" variant="outline">
            CLOSE
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Scaffold Modal ───────────────────────────────────────────────────────────

interface ScaffoldModalProps {
  file: { key: string; name: string };
  onClose: () => void;
}

function ScaffoldModal({ file, onClose }: ScaffoldModalProps) {
  const { toast } = useToast();
  const scaffoldMutation = useScaffoldFromFigma();

  const [repoName, setRepoName] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState("");
  const [result, setResult] = useState<FigmaScaffold | null>(null);

  const handleScaffold = () => {
    const phones = phoneNumbers.split(",").map((s) => s.trim()).filter(Boolean);
    scaffoldMutation.mutate(
      {
        data: {
          fileKey: file.key,
          componentName: file.name.replace(/[^a-zA-Z0-9]/g, ""),
          framework: "react",
          repoName: repoName.trim() || null,
          phoneNumbers: phones,
        },
      },
      {
        onSuccess: (data) => {
          setResult(data);
        },
        onError: () => {
          toast({ title: "Scaffold Failed", description: "Could not generate scaffold", variant: "destructive" });
          onClose();
        },
      }
    );
  };

  if (result) {
    return <ScaffoldResult result={result} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-[0_0_30px_rgba(0,255,255,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-accent/5 rounded-t-lg">
          <div className="flex items-center gap-3">
            <SiFigma className="w-4 h-4 text-[#F24E1E]" />
            <div>
              <h2 className="font-mono font-bold text-white">INITIATE_SCAFFOLD</h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-[260px]">{file.name}</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-muted-foreground">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-accent/5 border border-border rounded-md p-3 text-xs text-muted-foreground font-mono leading-relaxed">
            Gemini will analyze the Figma layout, generate a full project directory with
            README.md, bun.lockb, CI pipeline, components and tests (all with PORT=0 for
            zero-config port assignment), then commit everything to a new GitHub repo.
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground">GITHUB_REPO_NAME (optional)</Label>
            <Input
              placeholder="auto-generated from file name"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="bg-background border-border font-mono"
              data-testid="input-scaffold-repo-name"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground">SMS_NOTIFY (comma-separated, optional)</Label>
            <Input
              placeholder="+1234567890, +0987654321"
              value={phoneNumbers}
              onChange={(e) => setPhoneNumbers(e.target.value)}
              className="bg-background border-border font-mono"
              data-testid="input-scaffold-phones"
            />
            <p className="text-[10px] text-muted-foreground font-mono">
              Requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER env vars
            </p>
          </div>

          <Button
            className="w-full font-mono"
            onClick={handleScaffold}
            disabled={scaffoldMutation.isPending}
            data-testid="button-run-scaffold"
          >
            {scaffoldMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ANALYZING_DESIGN...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                GENERATE + COMMIT
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main DevOps Page ─────────────────────────────────────────────────────────

export default function DevOps() {
  const { data: repos, isLoading: reposLoading } = useListRepos();
  const { data: figmaFiles, isLoading: figmaLoading } = useListFigmaFiles();
  const { toast } = useToast();

  const [selectedRepo, setSelectedRepo] = useState<{ id: string; provider: "github" | "gitlab" } | null>(null);
  const [scaffoldTarget, setScaffoldTarget] = useState<{ key: string; name: string } | null>(null);

  return (
    <div className="p-8 space-y-6">
      {/* Scaffold modal */}
      {scaffoldTarget && (
        <ScaffoldModal
          file={scaffoldTarget}
          onClose={() => setScaffoldTarget(null)}
        />
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white font-mono">DEVOPS_CONTROL</h1>
        <p className="text-muted-foreground mt-1">Code repositories, build pipelines, and design assets.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Repositories ── */}
        <Card className="bg-card border-card-border flex flex-col max-h-[680px]">
          <CardHeader className="border-b border-border bg-accent/5 shrink-0">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              REPOSITORIES
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {reposLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {repos?.map((repo) => (
                  <div
                    key={repo.id}
                    className="p-4 hover:bg-accent/5 transition-colors cursor-pointer"
                    onClick={() =>
                      setSelectedRepo(
                        selectedRepo?.id === repo.id
                          ? null
                          : { id: repo.id, provider: repo.provider as "github" | "gitlab" }
                      )
                    }
                    data-testid={`repo-${repo.id}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3 min-w-0">
                        {repo.provider === "github" ? (
                          <SiGithub className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <SiGitlab className="w-4 h-4 text-[#FC6D26] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{repo.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            Updated: {new Date(repo.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-2 shrink-0">
                        {repo.stars !== undefined && (
                          <Badge variant="outline" className="font-mono bg-background text-xs">
                            <Star className="w-2.5 h-2.5 mr-1 text-yellow-500" />
                            {repo.stars}
                          </Badge>
                        )}
                        {repo.openIssues !== undefined && repo.openIssues > 0 && (
                          <Badge variant="outline" className="font-mono bg-background text-destructive border-destructive/30 text-xs">
                            <AlertCircle className="w-2.5 h-2.5 mr-1" />
                            {repo.openIssues}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {selectedRepo?.id === repo.id && (
                      <RepoActivityPanel
                        repoId={repo.id}
                        provider={repo.provider as "github" | "gitlab"}
                      />
                    )}
                  </div>
                ))}
                {repos?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_REPOS_FOUND</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Design Assets ── */}
        <Card className="bg-card border-card-border flex flex-col max-h-[680px]">
          <CardHeader className="border-b border-border bg-accent/5 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <SiFigma className="w-4 h-4 text-[#F24E1E]" />
                DESIGN_ASSETS
              </CardTitle>
              <div className="text-[10px] font-mono text-muted-foreground bg-accent/10 border border-border rounded px-2 py-1">
                AI_SCAFFOLD_READY
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {figmaLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {figmaFiles?.map((file) => (
                  <div
                    key={file.key}
                    className="p-4 flex items-center justify-between hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded bg-accent/10 flex items-center justify-center border border-border shrink-0">
                        <SiFigma className="w-4 h-4 text-[#F24E1E]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          Modified: {new Date(file.lastModified).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="ml-3 shrink-0 font-mono text-xs bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                      variant="outline"
                      onClick={() => setScaffoldTarget({ key: file.key, name: file.name })}
                      data-testid={`button-scaffold-${file.key}`}
                    >
                      <Zap className="w-3 h-3 mr-1.5" />
                      SCAFFOLD
                    </Button>
                  </div>
                ))}
                {figmaFiles?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_FIGMA_FILES</div>
                )}
              </div>
            )}

            {/* Info panel */}
            <div className="p-4 border-t border-border bg-accent/5 text-xs text-muted-foreground font-mono space-y-1">
              <div className="flex items-center gap-2 text-primary/70">
                <Zap className="w-3 h-3" />
                Scaffold pipeline
              </div>
              <div className="pl-5 space-y-0.5 text-[11px]">
                <div>1. Gemini 2.5 Flash analyzes layout → generates project JSON</div>
                <div>2. Security &amp; Quality Gate audits all files (auto-corrects)</div>
                <div>3. Creates private GitHub repo + pushes files (PORT=0 enforced)</div>
                <div>4. Sends Twilio SMS with repo URL (if configured)</div>
                <div>5. Syncs Project Brief → Google Drive + OneDrive archive</div>
                <div>6. CI_HEALTH_MONITOR available in result panel</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
