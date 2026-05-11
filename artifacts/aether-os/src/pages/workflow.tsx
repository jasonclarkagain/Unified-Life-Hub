import { useTriggerOneClickWorkflow, useListWorkflowRuns, getListWorkflowRunsQueryKey, useListHubspotDeals, OneClickWorkflowResult, WorkflowStepStatus } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, Play, CheckCircle2, XCircle, Clock, ChevronRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function Workflow() {
  const { data: runs, isLoading: runsLoading } = useListWorkflowRuns();
  const { data: deals, isLoading: dealsLoading } = useListHubspotDeals();

  const triggerMutation = useTriggerOneClickWorkflow();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dealId, setDealId] = useState<string>("");
  const [phoneNumbers, setPhoneNumbers] = useState<string>("");
  const [repoName, setRepoName] = useState<string>("");
  const [figmaKey, setFigmaKey] = useState<string>("");

  const [activeResult, setActiveResult] = useState<OneClickWorkflowResult | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealId) {
      toast({ title: "Validation Error", description: "Deal ID is required.", variant: "destructive" });
      return;
    }

    const phones = phoneNumbers.split(',').map((s) => s.trim()).filter(Boolean);

    triggerMutation.mutate({
      data: {
        dealId,
        teamPhoneNumbers: phones,
        repoName: repoName || undefined,
        figmaFileKey: figmaKey || undefined
      }
    }, {
      onSuccess: (result) => {
        toast({ title: "Workflow Triggered", description: `Execution completed: ${result.success ? 'Success' : 'Failed'}` });
        setActiveResult(result);
        queryClient.invalidateQueries({ queryKey: getListWorkflowRunsQueryKey() });
        setDealId("");
        setPhoneNumbers("");
        setRepoName("");
        setFigmaKey("");
      },
      onError: () => {
        toast({ title: "Execution Error", description: "Failed to run workflow.", variant: "destructive" });
      }
    });
  };

  const getStatusIcon = (status: WorkflowStepStatus) => {
    if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">ONE_CLICK_WORKFLOW</h1>
          <p className="text-muted-foreground mt-1">Automated execution orchestration.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="bg-card border-card-border">
            <CardHeader className="border-b border-border bg-accent/5">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                LAUNCH_PARAMETERS
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dealId" className="font-mono text-xs text-muted-foreground">TARGET_DEAL (REQUIRED)</Label>
                  <Select value={dealId} onValueChange={setDealId} disabled={dealsLoading}>
                    <SelectTrigger id="dealId" className="bg-background border-border font-mono" data-testid="select-deal">
                      <SelectValue placeholder="Select HubSpot Deal" />
                    </SelectTrigger>
                    <SelectContent>
                      {deals?.map((deal) => (
                        <SelectItem key={deal.id} value={deal.id} className="font-mono">
                          {deal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phones" className="font-mono text-xs text-muted-foreground">SMS_NOTIFY_LIST (COMMA_SEPARATED)</Label>
                  <Input
                    id="phones"
                    placeholder="+1234567890, +0987654321"
                    value={phoneNumbers}
                    onChange={(e) => setPhoneNumbers(e.target.value)}
                    className="bg-background border-border font-mono"
                    data-testid="input-phone-numbers"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repo" className="font-mono text-xs text-muted-foreground">GITHUB_REPO_NAME (OPTIONAL)</Label>
                  <Input
                    id="repo"
                    placeholder="new-project-scaffold"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="bg-background border-border font-mono"
                    data-testid="input-repo-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="figma" className="font-mono text-xs text-muted-foreground">FIGMA_FILE_KEY (OPTIONAL)</Label>
                  <Input
                    id="figma"
                    placeholder="abc123xyz"
                    value={figmaKey}
                    onChange={(e) => setFigmaKey(e.target.value)}
                    className="bg-background border-border font-mono"
                    data-testid="input-figma-key"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-mono mt-4"
                  disabled={triggerMutation.isPending}
                  data-testid="button-execute-workflow"
                >
                  <Play className={`w-4 h-4 mr-2 ${triggerMutation.isPending ? 'animate-pulse' : ''}`} />
                  {triggerMutation.isPending ? 'EXECUTING_SEQUENCE...' : 'INITIATE_SEQUENCE'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {activeResult && (
            <Card className="bg-card border-card-border border-primary/50 shadow-[0_0_15px_rgba(0,255,255,0.1)]">
              <CardHeader className="border-b border-border bg-primary/5">
                <CardTitle className="text-lg font-mono flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  EXECUTION_TRACE
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  DEAL: {activeResult.dealName} | STATUS: {activeResult.success ? 'SUCCESS' : 'FAILED'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {(activeResult.steps as { name: string; status: WorkflowStepStatus; detail?: string | null }[]).map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-0.5">{getStatusIcon(step.status)}</div>
                    <div>
                      <div className="font-mono text-sm text-foreground">{step.name}</div>
                      {step.detail && <div className="text-xs text-muted-foreground mt-1 font-mono break-all">{step.detail}</div>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card className="bg-card border-card-border h-full flex flex-col">
            <CardHeader className="border-b border-border bg-accent/5">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                EXECUTION_LOG
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
              {runsLoading ? (
                <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : (
                <div className="divide-y divide-border">
                  {runs?.map((run) => (
                    <div key={run.id} className="p-4 hover:bg-accent/5 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-mono text-sm text-foreground flex items-center gap-2">
                          {run.success ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                          RUN_ID: {run.id}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {new Date(run.triggeredAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">Deal: {run.dealName}</div>
                      {run.repoUrl && (
                        <a href={run.repoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 font-mono">
                          <ChevronRight className="w-3 h-3" /> REPO_CREATED
                        </a>
                      )}
                    </div>
                  ))}
                  {runs?.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground font-mono text-sm">NO_PREVIOUS_EXECUTIONS</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
