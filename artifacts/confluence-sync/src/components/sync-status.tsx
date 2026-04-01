import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, Play, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

import {
  useGetSyncStatus,
  useTriggerSync,
  useGetSyncLogs,
  getGetSyncStatusQueryKey,
  getGetSyncLogsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SyncStatusPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Poll sync status every 10 seconds
  const { data: status, isLoading: isStatusLoading } = useGetSyncStatus({
    query: {
      queryKey: getGetSyncStatusQueryKey(),
      refetchInterval: 10000,
    }
  });

  // Poll logs every 30 seconds
  const { data: logs, isLoading: isLogsLoading } = useGetSyncLogs({
    query: {
      queryKey: getGetSyncLogsQueryKey(),
      refetchInterval: 30000,
    }
  });

  const triggerSync = useTriggerSync();

  const handleTriggerSync = () => {
    triggerSync.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Sync triggered",
          description: "A manual synchronization has been started.",
        });
        queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSyncLogsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to trigger synchronization.",
          variant: "destructive",
        });
      },
    });
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
      case 'in_progress':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
    }
  };

  if (isStatusLoading) {
    return (
      <Card>
        <CardHeader className="pb-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isRunning = status?.isRunning;

  return (
    <Card className="border-primary/10 shadow-sm">
      <CardHeader className="pb-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Sync Engine
          </CardTitle>
          <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "animate-pulse" : ""}>
            {isRunning ? "Running" : "Idle"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="p-6 grid grid-cols-2 gap-4 border-b">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Total Mappings</p>
            <p className="text-2xl font-bold">{status?.totalMappings || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Documents Tracked</p>
            <p className="text-2xl font-bold">{status?.totalDocumentsTracked || 0}</p>
          </div>
          
          <div className="col-span-2 mt-2 pt-4 border-t flex items-center justify-between">
            <div className="flex items-center text-sm text-muted-foreground gap-2">
              <Clock className="w-4 h-4" />
              {status?.lastRunAt ? (
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    Last run {formatDistanceToNow(new Date(status.lastRunAt), { addSuffix: true })}
                  </TooltipTrigger>
                  <TooltipContent>
                    {format(new Date(status.lastRunAt), "PPpp")}
                  </TooltipContent>
                </Tooltip>
              ) : (
                "No syncs yet"
              )}
            </div>
            
            <Button 
              size="sm" 
              onClick={handleTriggerSync} 
              disabled={isRunning || triggerSync.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              Sync Now
            </Button>
          </div>
        </div>

        <div className="bg-muted/10 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
            Recent Activity
          </h4>
          
          <ScrollArea className="h-[300px]">
            {isLogsLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="text-center p-6 text-sm text-muted-foreground">
                No sync history available.
              </div>
            ) : (
              <div className="space-y-2 px-2">
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="p-3 bg-background border rounded-md text-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium">
                        <StatusIcon status={log.status} />
                        <span className="capitalize">{log.status}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.startedAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span title="Processed" className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-muted-foreground" /> {log.documentsProcessed}
                      </span>
                      {log.documentsSkipped > 0 && (
                        <span title="Skipped" className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-muted-foreground" /> {log.documentsSkipped}
                        </span>
                      )}
                      {log.documentsErrored > 0 && (
                        <span title="Errors" className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" /> {log.documentsErrored}
                        </span>
                      )}
                    </div>

                    {log.errorMessage && (
                      <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded mt-2 break-words">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
