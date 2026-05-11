import { useGetCurrentVibe, useApplyVibe, useGetCalendarEvents, useListHealthChecks, useRunHealthCheck, getListHealthChecksQueryKey, getGetCurrentVibeQueryKey, VibeInputPreset } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiSpotify } from "react-icons/si";
import { Calendar, MonitorSpeaker, Activity, Play, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Environment() {
  const { data: vibeStatus, isLoading: vibeLoading } = useGetCurrentVibe();
  const { data: events, isLoading: eventsLoading } = useGetCalendarEvents({ days: 1 });
  const { data: healthChecks, isLoading: healthLoading } = useListHealthChecks();

  const applyVibeMutation = useApplyVibe();
  const runHealthCheckMutation = useRunHealthCheck();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleVibeChange = (preset: VibeInputPreset) => {
    applyVibeMutation.mutate({ data: { preset } }, {
      onSuccess: (data) => {
        toast({ title: "Vibe Updated", description: `Switched to ${preset} mode.` });
        queryClient.setQueryData(getGetCurrentVibeQueryKey(), data);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update vibe.", variant: "destructive" });
      }
    });
  };

  const handleRunHealthCheck = (_id: string, url: string) => {
    runHealthCheckMutation.mutate({ data: { url } }, {
      onSuccess: () => {
        toast({ title: "Health Check Complete", description: `Checked ${url}` });
        queryClient.invalidateQueries({ queryKey: getListHealthChecksQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Health check failed.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">ENVIRONMENT</h1>
          <p className="text-muted-foreground mt-1">Physical surroundings, schedule, and infrastructure health.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIBE CONTROL */}
        <Card className="bg-card border-card-border lg:col-span-1">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <MonitorSpeaker className="w-5 h-5 text-primary" />
              VIBE_CONTROL
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {vibeLoading ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground">ACTIVE_PRESET</label>
                  <Select
                    value={vibeStatus?.preset}
                    onValueChange={(val) => handleVibeChange(val as VibeInputPreset)}
                    disabled={applyVibeMutation.isPending}
                  >
                    <SelectTrigger className="w-full bg-background border-border font-mono uppercase" data-testid="select-vibe-preset">
                      <SelectValue placeholder="Select Vibe" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(VibeInputPreset).map((preset) => (
                        <SelectItem key={preset} value={preset} className="font-mono uppercase">
                          {preset}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {vibeStatus?.isPlaying && (
                  <div className="bg-accent/10 border border-accent/20 rounded-md p-4 flex items-center gap-4">
                    <SiSpotify className="w-8 h-8 text-[#1DB954]" />
                    <div className="overflow-hidden">
                      <div className="text-sm font-medium text-white truncate">{vibeStatus.trackName}</div>
                      <div className="text-xs text-muted-foreground truncate">{vibeStatus.artistName}</div>
                      <div className="text-[10px] text-accent font-mono mt-1 flex items-center gap-1">
                        <Play className="w-3 h-3" /> NOW_PLAYING
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* CALENDAR */}
        <Card className="bg-card border-card-border lg:col-span-1">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              UPCOMING_EVENTS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {eventsLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /></div>
            ) : (
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                {events?.map((event) => (
                  <div key={event.id} className="p-4 hover:bg-accent/5 transition-colors">
                    <div className="font-medium text-foreground">{event.subject}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                      <span>{new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {event.isOnlineMeeting && <Badge variant="outline" className="font-mono text-[10px] py-0 h-4">ONLINE</Badge>}
                    </div>
                  </div>
                ))}
                {events?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_UPCOMING_EVENTS</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HEALTH CHECKS */}
        <Card className="bg-card border-card-border lg:col-span-1">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              SYSTEM_HEALTH
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {healthLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /></div>
            ) : (
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                {healthChecks?.map((check) => (
                  <div key={check.id} className="p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-mono text-sm text-foreground truncate pr-4" title={check.url}>{check.url.replace(/^https?:\/\//, '')}</div>
                      {check.status === "healthy" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : check.status === "down" ? (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-mono">
                        {check.statusCode ? `${check.statusCode} OK` : 'ERR'} {check.responseTimeMs ? `• ${check.responseTimeMs}ms` : ''}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => handleRunHealthCheck(check.id, check.url)}
                        disabled={runHealthCheckMutation.isPending}
                        data-testid={`button-check-${check.id}`}
                      >
                        <RefreshCw className={`w-3 h-3 ${runHealthCheckMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
