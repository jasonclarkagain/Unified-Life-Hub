import { useSearchFiles, useGetRecentFiles, useGetStorageStats, getSearchFilesQueryKey, getGetRecentFilesQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiGoogledrive } from "react-icons/si";
import { HardDrive, Search, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function Storage() {
  const [searchQuery, setSearchQuery] = useState("");

  const isSearching = searchQuery.length > 2;

  const { data: searchResults, isLoading: searchLoading } = useSearchFiles(
    { q: searchQuery },
    { query: { enabled: isSearching, queryKey: getSearchFilesQueryKey({ q: searchQuery }) } }
  );

  const { data: recentFiles, isLoading: recentLoading } = useGetRecentFiles(
    {},
    { query: { queryKey: getGetRecentFilesQueryKey({}) } }
  );

  const { data: stats, isLoading: statsLoading } = useGetStorageStats();

  const displayFiles = isSearching ? searchResults : recentFiles;

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-mono">STORAGE_MATRIX</h1>
          <p className="text-muted-foreground mt-1">Unified cloud filesystem across all providers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-card-border md:col-span-2">
          <CardHeader className="border-b border-border bg-accent/5">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search across Drive, OneDrive..."
                className="pl-10 bg-background border-border font-mono"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-storage-search"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[500px] overflow-y-auto">
            {(isSearching && searchLoading) || (!isSearching && recentLoading) ? (
              <div className="p-4 space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : (
              <div className="divide-y divide-border">
                {!isSearching && (
                  <div className="p-2 bg-accent/5 text-xs font-mono text-muted-foreground flex items-center gap-2">
                    <Clock className="w-3 h-3" /> RECENT_FILES
                  </div>
                )}
                {displayFiles?.map((file) => (
                  <a
                    key={file.id}
                    href={file.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 flex items-center justify-between hover:bg-accent/5 transition-colors block"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center border border-border shrink-0">
                        {file.provider === "google-drive"
                          ? <SiGoogledrive className="w-5 h-5 text-[#0F9D58]" />
                          : <HardDrive className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-medium text-foreground truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1 truncate">
                          {file.ownerName && <span>Owner: {file.ownerName} | </span>}
                          Mod: {new Date(file.modifiedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {file.size != null && (
                      <div className="text-xs text-muted-foreground font-mono whitespace-nowrap ml-4">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </a>
                ))}
                {displayFiles?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground font-mono">NO_FILES_FOUND</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card border-card-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium font-mono text-muted-foreground">STORAGE_STATS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statsLoading ? <Skeleton className="h-32 w-full" /> : (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total Indexed Files</div>
                    <div className="text-3xl font-bold font-mono text-white">{stats?.totalFiles.toLocaleString()}</div>
                  </div>
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div className="flex justify-between items-center text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground"><SiGoogledrive className="w-3 h-3 text-[#0F9D58]" /> GDrive</span>
                      <span className="font-mono font-medium">{stats?.googleDriveFiles.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground"><HardDrive className="w-3 h-3 text-primary" /> OneDrive</span>
                      <span className="font-mono font-medium">{stats?.oneDriveFiles.toLocaleString()}</span>
                    </div>
                    {stats?.googleDriveUsedBytes != null && (
                      <div className="pt-2 border-t border-border text-xs text-muted-foreground font-mono">
                        GDrive Used: {(stats.googleDriveUsedBytes / 1073741824).toFixed(2)} GB
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
