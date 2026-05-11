import {
  useGetDevopsSummary,
  useGetFocusFeedStats,
  useGetStorageStats,
  useGetCurrentVibe,
  useHealthCheck,
  useAnalyzePrHealth,
  useApplyVibe,
  PrHealthSummary,
  PrCategory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  GitBranch,
  Inbox,
  HardDrive,
  MonitorSpeaker,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  GitMerge,
  ChevronRight,
  Loader2,
  Clock,
  BarChart3,
  Music2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// ─── PR Category Row ──────────────────────────────────────────────────────────

function PrRow({ pr, accent }: { pr: PrCategory; accent: string }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-2 text-xs group hover:bg-accent/5 rounded px-2 py-1.5 -mx-2 transition-colors"
    >
      <span className={`mt-0.5 font-mono shrink-0 ${accent}`}>#{pr.id}</span>
      <div className="flex-1 min-w-0">
        <div className="text-foreground truncate group-hover:text-primary transition-colors">{pr.title}</div>
        <div className="text-muted-foreground mt-0.5 truncate">{pr.reason}</div>
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── PR Health Panel ──────────────────────────────────────────────────────────

function PrHealthPanel({
  health,
  vibeApplied,
}: {
  health: PrHealthSummary;
  vibeApplied: string | null;
}) {
  const [, navigate] = useLocation();

  const categories = [
    {
      label: "BLOCKING_RELEASE",
      items: health.blocking,
      icon: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />,
      accent: "text-destructive",
      bg: "border-destructive/20 bg-destructive/5",
    },
    {
      label: "FAILING_CI",
      items: health.failingCi,
      icon: <XCircle className="w-3.5 h-3.5 text-orange-400" />,
      accent: "text-orange-400",
      bg: "border-orange-500/20 bg-orange-500/5",
      devopsLink: true,
    },
    {
      label: "READY_TO_MERGE",
      items: health.readyToMerge,
      icon: <GitMerge className="w-3.5 h-3.5 text-green-500" />,
      accent: "text-green-500",
      bg: "border-green-500/20 bg-green-500/5",
    },
    {
      label: "IN_PROGRESS",
      items: health.other,
      icon: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
      accent: "text-muted-foreground",
      bg: "border-border bg-accent/5",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-accent/5 border border-border rounded-md p-3 text-sm text-foreground leading-relaxed font-mono">
        {health.summary}
      </div>

      {/* Vibe applied notification */}
      {vibeApplied && (
        <div className="flex items-center gap-2 text-xs font-mono bg-primary/10 border border-primary/20 rounded-md px-3 py-2 text-primary">
          <Music2 className="w-3.5 h-3.5 shrink-0" />
          Spotify auto-switched to <strong>{vibeApplied.toUpperCase()}</strong> preset based on project health
        </div>
      )}

      {/* Stat pills */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="font-mono bg-background text-xs">
          <GitBranch className="w-3 h-3 mr-1 text-primary" />
          {health.totalPrs} Total PRs
        </Badge>
        {health.blocking.length > 0 && (
          <Badge variant="outline" className="font-mono bg-destructive/10 border-destructive/30 text-destructive text-xs">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {health.blocking.length} Blocking
          </Badge>
        )}
        {health.readyToMerge.length > 0 && (
          <Badge variant="outline" className="font-mono bg-green-500/10 border-green-500/30 text-green-500 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {health.readyToMerge.length} Ready
          </Badge>
        )}
        {health.failingCi.length > 0 && (
          <Badge variant="outline" className="font-mono bg-orange-500/10 border-orange-500/30 text-orange-400 text-xs">
            <XCircle className="w-3 h-3 mr-1" />
            {health.failingCi.length} Failing CI
          </Badge>
        )}
      </div>

      {/* Category sections */}
      <div className="space-y-3">
        {categories.map((cat) => {
          if (cat.items.length === 0) return null;
          return (
            <div key={cat.label} className={`border rounded-md p-3 ${cat.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                  {cat.icon}
                  {cat.label} ({cat.items.length})
                </div>
                {cat.devopsLink && cat.items.length > 0 && (
                  <button
                    onClick={() => navigate("/devops")}
                    className="text-[10px] font-mono text-primary hover:underline flex items-center gap-0.5"
                  >
                    TROUBLESHOOT <ChevronRight className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {cat.items.slice(0, 4).map((pr) => (
                  <PrRow key={pr.id} pr={pr} accent={cat.accent} />
                ))}
                {cat.items.length > 4 && (
                  <div className="text-[10px] text-muted-foreground font-mono pl-2 pt-1">
                    +{cat.items.length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-muted-foreground font-mono text-right">
        Analyzed: {new Date(health.generatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: devopsSummary, isLoading: devopsLoading } = useGetDevopsSummary();
  const { data: focusStats, isLoading: focusLoading } = useGetFocusFeedStats();
  const { data: storageStats, isLoading: storageLoading } = useGetStorageStats();
  const { data: vibeStatus, isLoading: vibeLoading } = useGetCurrentVibe();
  const { data: healthStatus, isLoading: healthLoading } = useHealthCheck();
  const prHealthMutation = useAnalyzePrHealth();
  const applyVibeMutation = useApplyVibe();
  const { toast } = useToast();

  const [prHealth, setPrHealth] = useState<PrHealthSummary | null>(null);
  const [vibeApplied, setVibeApplied] = useState<string | null>(null);

  const handleSyncPrHealth = () => {
    setVibeApplied(null);
    prHealthMutation.mutate(
      { data: {} },
      {
        onSuccess: (data) => {
          setPrHealth(data);

          // ── Context-aware Spotify auto-switch ──────────────────────────
          const allReady = data.blocking.length === 0 &&
            data.failingCi.length === 0 &&
            data.readyToMerge.length > 0 &&
            data.other.length === 0;

          const hasBlockers = data.blocking.length > 0;
          const hasCiFailures = data.failingCi.length > 0;

          let targetPreset: "focus" | "creative" | null = null;

          if (hasBlockers || hasCiFailures) {
            // Pressure situation → Deep Focus / Lo-Fi
            targetPreset = "focus";
          } else if (allReady) {
            // All PRs ready → Celebratory / Creative
            targetPreset = "creative";
          }

          if (targetPreset) {
            applyVibeMutation.mutate(
              { data: { preset: targetPreset, playlistId: null } },
              {
                onSuccess: () => {
                  setVibeApplied(targetPreset);
                  toast({
                    title: "VIBE_SYNC",
                    description: `Spotify switched to ${targetPreset.toUpperCase()} based on PR health`,
                  });
                },
              }
            );
          }
        },
      }
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">COMMAND_DASHBOARD</h1>
          <p className="text-muted-foreground mt-1">System overview and unified intelligence feed.</p>
        </div>
        <Link href="/workflow">
          <Button variant="default" className="font-mono" data-testid="button-launch-workflow">
            <Zap className="mr-2 h-4 w-4" />
            LAUNCH_WORKFLOW
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">DEVOPS_SUMMARY</CardTitle>
            <GitBranch className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {devopsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-white">{devopsSummary?.openPRs ?? 0} PRs</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {devopsSummary?.openIssues ?? 0} open issues · {devopsSummary?.totalRepos ?? 0} repos
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">FOCUS_FEED</CardTitle>
            <Inbox className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {focusLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-white">{focusStats?.urgentCount ?? 0} Urgent</div>
                <p className="text-xs text-muted-foreground mt-1">{focusStats?.openDeals ?? 0} active deals</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">STORAGE_STATS</CardTitle>
            <HardDrive className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {storageLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-white">{storageStats?.totalFiles ?? 0} Files</div>
                <p className="text-xs text-muted-foreground mt-1">GDrive & OneDrive</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">VIBE_STATUS</CardTitle>
            <MonitorSpeaker className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {vibeLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-white capitalize">{vibeStatus?.preset ?? "OFF"}</div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {vibeStatus?.isPlaying
                    ? `${vibeStatus.trackName} - ${vibeStatus.artistName}`
                    : "No track playing"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">HEALTH_CHECK</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-white capitalize">{healthStatus?.status ?? "UNKNOWN"}</div>
                <p className="text-xs text-muted-foreground mt-1">System core</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Project Health (full-width) ── */}
      <Card className="bg-card border-card-border">
        <CardHeader className="border-b border-border bg-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-mono">PROJECT_HEALTH</CardTitle>
              {prHealth && (
                <Badge variant="outline" className="font-mono text-[10px] bg-background ml-2">
                  {prHealth.totalPrs} PRs analyzed
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {vibeApplied && (
                <div className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-1">
                  <Music2 className="w-3 h-3" />
                  Spotify: {vibeApplied.toUpperCase()}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncPrHealth}
                disabled={prHealthMutation.isPending}
                className="font-mono text-xs"
                data-testid="button-sync-pr-health"
              >
                {prHealthMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ANALYZING...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1.5" />
                    SYNC_PROJECT_HEALTH
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {!prHealth && !prHealthMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
              <div className="font-mono text-sm text-muted-foreground">NO_HEALTH_DATA</div>
              <p className="text-xs text-muted-foreground max-w-sm">
                Click <strong>SYNC_PROJECT_HEALTH</strong> to have Gemini analyze your open
                pull requests and generate an executive project health summary. Spotify will
                automatically switch presets based on the results.
              </p>
              <Button
                size="sm"
                onClick={handleSyncPrHealth}
                className="font-mono text-xs mt-2"
                data-testid="button-sync-pr-health-empty"
              >
                <Zap className="w-3 h-3 mr-1.5" />
                ANALYZE NOW
              </Button>
            </div>
          )}

          {prHealthMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div className="font-mono text-sm text-muted-foreground">Gemini is analyzing your PRs...</div>
              <p className="text-xs text-muted-foreground">Categorizing by urgency + auto-selecting Spotify vibe</p>
            </div>
          )}

          {prHealth && !prHealthMutation.isPending && (
            <PrHealthPanel health={prHealth} vibeApplied={vibeApplied} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
