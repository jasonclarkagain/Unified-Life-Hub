import { useGetDevopsSummary, useGetFocusFeedStats, useGetStorageStats, useGetCurrentVibe, useHealthCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, GitBranch, Inbox, HardDrive, MonitorSpeaker, Activity } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: devopsSummary, isLoading: devopsLoading } = useGetDevopsSummary();
  const { data: focusStats, isLoading: focusLoading } = useGetFocusFeedStats();
  const { data: storageStats, isLoading: storageLoading } = useGetStorageStats();
  const { data: vibeStatus, isLoading: vibeLoading } = useGetCurrentVibe();
  const { data: healthStatus, isLoading: healthLoading } = useHealthCheck();

  return (
    <div className="p-8 space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-mono text-muted-foreground">DEVOPS_SUMMARY</CardTitle>
            <GitBranch className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {devopsLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-white">{devopsSummary?.openPRs ?? 0} PRs</div>
                <p className="text-xs text-muted-foreground mt-1">{devopsSummary?.openIssues ?? 0} open issues</p>
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
            {focusLoading ? <Skeleton className="h-8 w-24" /> : (
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
            {storageLoading ? <Skeleton className="h-8 w-24" /> : (
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
            {vibeLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-white capitalize">{vibeStatus?.preset ?? 'OFF'}</div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {vibeStatus?.isPlaying ? `${vibeStatus.trackName} - ${vibeStatus.artistName}` : 'No track playing'}
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
            {healthLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-2xl font-bold text-white capitalize">{healthStatus?.status ?? 'UNKNOWN'}</div>
                <p className="text-xs text-muted-foreground mt-1">System core</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
