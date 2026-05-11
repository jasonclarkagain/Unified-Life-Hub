import { useListRepos, useListFigmaFiles, useScaffoldFromFigma, useFetchRepoActivity } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiGithub, SiGitlab, SiFigma } from "react-icons/si";
import { GitCommit, GitPullRequest, AlertCircle, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function RepoActivityPanel({ repoId, provider }: { repoId: string; provider: "github" | "gitlab" }) {
  const { data: activity, isLoading } = useFetchRepoActivity({ repoId, provider });

  if (isLoading) {
    return <Skeleton className="h-32 w-full mt-2" />;
  }

  if (!activity) return null;

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="space-y-2">
        <h4 className="text-xs font-mono text-muted-foreground flex items-center gap-1"><GitCommit className="w-3 h-3" /> RECENT_COMMITS</h4>
        {activity.commits.slice(0, 3).map((commit, i) => (
          <div key={i} className="text-sm flex justify-between items-center bg-accent/5 p-2 rounded">
            <span className="truncate pr-4 text-foreground">{commit.message}</span>
            <span className="text-muted-foreground font-mono text-xs">{commit.sha.substring(0, 7)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DevOps() {
  const { data: repos, isLoading: reposLoading } = useListRepos();
  const { data: figmaFiles, isLoading: figmaLoading } = useListFigmaFiles();
  const scaffoldMutation = useScaffoldFromFigma();
  const { toast } = useToast();
  const [selectedRepo, setSelectedRepo] = useState<{ id: string; provider: "github" | "gitlab" } | null>(null);

  const handleScaffold = (fileKey: string, fileName: string) => {
    scaffoldMutation.mutate({ data: { fileKey, componentName: "NewComponent" } }, {
      onSuccess: () => {
        toast({ title: "Scaffold Generated", description: `Generated component for ${fileName}` });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to generate scaffold", variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">DEVOPS_CONTROL</h1>
          <p className="text-muted-foreground mt-1">Code repositories, build pipelines, and design assets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-card-border overflow-hidden flex flex-col">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-primary" />
              REPOSITORIES
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {reposLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <div className="divide-y divide-border">
                {repos?.map((repo) => (
                  <div key={repo.id} className="p-4 hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => setSelectedRepo(selectedRepo?.id === repo.id ? null : { id: repo.id, provider: repo.provider as "github" | "gitlab" })}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        {repo.provider === "github" ? <SiGithub className="w-5 h-5 text-muted-foreground" /> : <SiGitlab className="w-5 h-5 text-[#FC6D26]" />}
                        <div>
                          <div className="font-medium text-foreground">{repo.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-1">Updated: {new Date(repo.updatedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {repo.stars !== undefined && (
                          <Badge variant="outline" className="font-mono bg-background"><Star className="w-3 h-3 mr-1 text-yellow-500" /> {repo.stars}</Badge>
                        )}
                        {repo.openIssues !== undefined && (
                          <Badge variant="outline" className="font-mono bg-background text-destructive border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" /> {repo.openIssues}</Badge>
                        )}
                      </div>
                    </div>
                    {selectedRepo?.id === repo.id && (
                      <RepoActivityPanel repoId={repo.id} provider={repo.provider as "github" | "gitlab"} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border overflow-hidden flex flex-col">
          <CardHeader className="border-b border-border bg-accent/5">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <SiFigma className="w-5 h-5 text-[#F24E1E]" />
              DESIGN_ASSETS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {figmaLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <div className="divide-y divide-border">
                {figmaFiles?.map((file) => (
                  <div key={file.key} className="p-4 flex items-center justify-between hover:bg-accent/5 transition-colors">
                    <div className="flex items-center gap-4">
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt={file.name} className="w-10 h-10 rounded object-cover border border-border" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center border border-border">
                          <SiFigma className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{file.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">Modified: {new Date(file.lastModified).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleScaffold(file.key, file.name)}
                      disabled={scaffoldMutation.isPending}
                      data-testid={`button-scaffold-${file.key}`}
                    >
                      <Play className="w-3 h-3 mr-1 text-primary" />
                      SCAFFOLD
                    </Button>
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