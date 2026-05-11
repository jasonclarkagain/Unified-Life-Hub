import { useGetFocusFeed, usePrioritizeFeed, useListHubspotDeals, getGetFocusFeedQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiGmail, SiHubspot } from "react-icons/si";
import { Mail, Briefcase, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Focus() {
  const { data: feedItems, isLoading: feedLoading } = useGetFocusFeed();
  const { data: deals, isLoading: dealsLoading } = useListHubspotDeals();
  const prioritizeMutation = usePrioritizeFeed();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePrioritize = () => {
    if (!feedItems) return;
    prioritizeMutation.mutate({ data: { items: feedItems } }, {
      onSuccess: (data) => {
        toast({ title: "Feed Prioritized", description: "AI has re-scored your items." });
        queryClient.setQueryData(getGetFocusFeedQueryKey(), data);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to prioritize feed.", variant: "destructive" });
      }
    });
  };

  const getUrgencyColor = (score: number) => {
    if (score >= 80) return "text-destructive border-destructive/20 bg-destructive/10";
    if (score >= 50) return "text-yellow-500 border-yellow-500/20 bg-yellow-500/10";
    return "text-green-500 border-green-500/20 bg-green-500/10";
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">FOCUS_FEED</h1>
          <p className="text-muted-foreground mt-1">Unified priority inbox and active deals.</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handlePrioritize} 
          disabled={prioritizeMutation.isPending || !feedItems?.length}
          data-testid="button-prioritize"
          className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Zap className="mr-2 h-4 w-4" />
          {prioritizeMutation.isPending ? "PRIORITIZING..." : "AI_PRIORITIZE"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-card-border overflow-hidden flex flex-col">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              UNIFIED_INBOX
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {feedLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
            ) : (
              <div className="divide-y divide-border">
                {feedItems?.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {item.source === "gmail" && <SiGmail className="w-4 h-4 text-[#EA4335]" />}
                          {item.source === "hubspot" && <SiHubspot className="w-4 h-4 text-[#FF7A59]" />}
                        </div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-2">
                            {item.sender}
                            {!item.isRead && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <div className="text-sm text-foreground mt-1">{item.subject}</div>
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.preview}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`font-mono shrink-0 ${getUrgencyColor(item.urgencyScore)}`}>
                        SCORE: {item.urgencyScore}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border overflow-hidden flex flex-col">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#FF7A59]" />
              ACTIVE_DEALS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {dealsLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <div className="divide-y divide-border">
                {deals?.map((deal) => (
                  <div key={deal.id} className="p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-foreground">{deal.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">STAGE: {deal.stage}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-primary font-mono">
                          {deal.amount ? `$${deal.amount.toLocaleString()}` : "TBD"}
                        </div>
                        {deal.closeDate && (
                          <div className="text-xs text-muted-foreground mt-1 font-mono">
                            CLOSE: {new Date(deal.closeDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
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