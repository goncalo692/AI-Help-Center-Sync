import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import {
  Activity, Play, CheckCircle2, XCircle, AlertCircle, Clock,
  Database, FileText, ArrowLeft, Eye, ChevronRight, Link2, ChevronDown, RefreshCw, RotateCcw,
} from "lucide-react";

import {
  useGetSyncStatus,
  useTriggerSync,
  useGetSyncLogs,
  useListSyncSources,
  useListSourceDocuments,
  useGetDocumentPreview,
  getGetSyncStatusQueryKey,
  getGetSyncLogsQueryKey,
  getListSyncSourcesQueryKey,
  getListSourceDocumentsQueryKey,
  getGetDocumentPreviewQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarLayout } from "@/components/sidebar-layout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function StatusIcon({ status, hasErrors }: { status: string; hasErrors?: boolean }) {
  switch (status.toLowerCase()) {
    case "success":
    case "completed":
      if (hasErrors) return <AlertCircle className="w-4 h-4 text-amber-500" />;
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "running":
    case "in_progress":
      return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
    default:
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
  }
}

function StatusLabel({ status, hasErrors }: { status: string; hasErrors?: boolean }) {
  if ((status === "completed" || status === "success") && hasErrors) {
    return <span className="text-amber-600">Completed with errors</span>;
  }
  if (status === "error" || status === "failed") {
    return <span className="text-red-500 capitalize">{status}</span>;
  }
  return <span className="capitalize">{status}</span>;
}

function SyncOverview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: isStatusLoading } = useGetSyncStatus({
    query: {
      queryKey: getGetSyncStatusQueryKey(),
      refetchInterval: 10000,
    },
  });

  const triggerSync = useTriggerSync();

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const handleTriggerSync = () => {
    triggerSync.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Sync triggered", description: "A manual synchronization has been started." });
        queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSyncLogsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSyncSourcesQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to trigger synchronization.", variant: "destructive" });
      },
    });
  };

  const handleForceSync = async () => {
    setIsForceSyncing(true);
    try {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}api/sync/force`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Force sync triggered", description: "All documents will be re-synced regardless of last sync time." });
      queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSyncLogsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSyncSourcesQueryKey() });
    } catch {
      toast({ title: "Error", description: "Failed to trigger force sync.", variant: "destructive" });
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleResetSources = async () => {
    setIsForceSyncing(true);
    try {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}api/sync/reset-sources`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Knowledge bases reset", description: "New knowledge bases will be created and all documents re-synced." });
      queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSyncLogsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSyncSourcesQueryKey() });
    } catch {
      toast({ title: "Error", description: "Failed to reset knowledge bases.", variant: "destructive" });
    } finally {
      setIsForceSyncing(false);
    }
  };

  if (isStatusLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const isRunning = status?.isRunning;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Sync Engine</h3>
            <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "animate-pulse" : ""}>
              {isRunning ? "Running" : "Idle"}
            </Badge>
          </div>
          <div className="flex items-center">
            <Button size="sm" onClick={handleTriggerSync} disabled={isRunning || triggerSync.isPending || isForceSyncing} className="rounded-r-none">
              <Play className="w-4 h-4 mr-2" />
              Sync Now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="rounded-l-none border-l border-l-primary-foreground/20 px-2" disabled={isRunning || triggerSync.isPending || isForceSyncing}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleForceSync} disabled={isRunning || isForceSyncing}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Force Sync All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleResetSources} disabled={isRunning || isForceSyncing} className="text-destructive focus:text-destructive">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Knowledge Bases
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {(status?.lastRunStatus === "error" || status?.lastRunStatus === "failed" || (status?.lastRunErrored ?? 0) > 0) && (
          <div className="mb-6 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {status?.lastRunStatus === "error" || status?.lastRunStatus === "failed"
                    ? "Last sync failed"
                    : `Last sync completed with ${status?.lastRunErrored} error${(status?.lastRunErrored ?? 0) !== 1 ? "s" : ""}`
                  }
                </p>
                {status?.lastRunErrorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400/80 mt-1 break-words">
                    {status.lastRunErrorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Mappings</p>
            <p className="text-2xl font-bold">{status?.totalMappings || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Documents Tracked</p>
            <p className="text-2xl font-bold">{status?.totalDocumentsTracked || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Last Run</p>
            <p className="text-sm font-medium">
              {status?.lastRunAt ? (
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    {formatDistanceToNow(new Date(status.lastRunAt), { addSuffix: true })}
                  </TooltipTrigger>
                  <TooltipContent>{format(new Date(status.lastRunAt), "PPpp")}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncLogs() {
  const { data: logs, isLoading } = useGetSyncLogs({
    query: {
      queryKey: getGetSyncLogsQueryKey(),
      refetchInterval: 30000,
    },
  });

  return (
    <Card className="flex flex-col min-h-0 h-full">
      <CardHeader className="py-4 px-6 border-b shrink-0">
        <CardTitle className="text-base leading-normal flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground">No sync history available.</div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => {
                const hasErrors = log.documentsErrored > 0;
                return (
                  <div key={log.id} className={`px-4 py-3 text-sm ${hasErrors || log.status === "error" ? "border-l-2 border-l-red-400" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-medium">
                        <StatusIcon status={log.status} hasErrors={hasErrors} />
                        <StatusLabel status={log.status} hasErrors={hasErrors} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.startedAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {log.documentsProcessed} processed
                      </span>
                      {log.documentsSkipped > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {log.documentsSkipped} skipped
                        </span>
                      )}
                      {log.documentsErrored > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" /> {log.documentsErrored} error{log.documentsErrored !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {log.errorMessage && (
                      <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded mt-2 break-words">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function KnowledgeBases() {
  const [selectedMappingId, setSelectedMappingId] = useState<number | null>(null);

  const { data: sources, isLoading } = useListSyncSources({
    query: {
      queryKey: getListSyncSourcesQueryKey(),
      refetchInterval: 15000,
    },
  });

  if (selectedMappingId !== null) {
    const source = sources?.find((s) => s.mappingId === selectedMappingId);
    return (
      <DocumentList
        mappingId={selectedMappingId}
        sourceName={source?.knowledgeSegmentName || ""}
        onBack={() => setSelectedMappingId(null)}
      />
    );
  }

  return (
    <Card className="flex flex-col min-h-0 h-full">
      <CardHeader className="py-4 px-6 border-b shrink-0">
        <CardTitle className="text-base leading-normal flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground shrink-0" />
          Knowledge Bases
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !sources || sources.length === 0 ? (
          <div className="text-center p-8 text-sm text-muted-foreground">
            No knowledge bases created yet. Configure folder mappings in Settings and run a sync.
          </div>
        ) : (
          <div className="divide-y">
            {sources.map((source) => (
              <button
                key={source.mappingId}
                onClick={() => setSelectedMappingId(source.mappingId)}
                className="w-full px-4 py-4 text-left hover:bg-muted/50 transition-colors flex items-center justify-between group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{source.knowledgeSegmentName}</span>
                    {source.externalSourceId && (
                      <Badge variant="outline" className="text-xs shrink-0">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {source.documentCount} document{source.documentCount !== 1 ? "s" : ""}
                    </span>
                    <span>from {source.confluenceFolderName}</span>
                    {source.lastSyncedAt && (
                      <span>synced {formatDistanceToNow(new Date(source.lastSyncedAt), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentList({
  mappingId,
  sourceName,
  onBack,
}: {
  mappingId: number;
  sourceName: string;
  onBack: () => void;
}) {
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);

  const { data: docs, isLoading } = useListSourceDocuments(mappingId, {
    query: {
      queryKey: getListSourceDocumentsQueryKey(mappingId),
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base">{sourceName}</CardTitle>
            <Badge variant="secondary" className="ml-auto">{docs?.length || 0} documents</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !docs || docs.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground">
              No documents synced yet. Trigger a sync to populate this knowledge base.
            </div>
          ) : (
            <div className="divide-y">
              {docs.map((doc) => {
                const isSmartLink = doc.confluenceDocumentId.startsWith("embed-");
                return (
                  <div
                    key={doc.id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isSmartLink ? (
                        <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{doc.documentTitle || `Document ${doc.confluenceDocumentId}`}</p>
                          {isSmartLink && (
                            <Badge variant="outline" className="text-xs shrink-0 text-blue-600 border-blue-200">Smart Link</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {doc.lastSyncedAt && (
                            <span>synced {formatDistanceToNow(new Date(doc.lastSyncedAt), { addSuffix: true })}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewDocId(doc.id)}
                      className="shrink-0 ml-2"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {previewDocId !== null && (
        <DocumentPreviewDialog documentId={previewDocId} onClose={() => setPreviewDocId(null)} />
      )}
    </>
  );
}

function SafeHtmlPreview({ html }: { html: string }) {
  const sanitizedHtml = useMemo(() => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
        "ul", "ol", "li", "dl", "dt", "dd",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "strong", "em", "b", "i", "u", "s", "sub", "sup", "small", "mark",
        "blockquote", "pre", "code", "span", "div", "a",
      ],
      ALLOWED_ATTR: ["href", "title", "class", "id", "colspan", "rowspan", "scope", "align", "valign"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      ALLOW_DATA_ATTR: false,
    });
  }, [html]);

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/50"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

function DocumentPreviewDialog({ documentId, onClose }: { documentId: number; onClose: () => void }) {
  const { data: preview, isLoading } = useGetDocumentPreview(documentId, {
    query: {
      queryKey: getGetDocumentPreviewQueryKey(documentId),
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {isLoading ? "Loading..." : preview?.documentTitle || "Document Preview"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <div className="p-4">
              {preview?.lastSyncedAt && (
                <p className="text-xs text-muted-foreground mb-4">
                  Last synced: {format(new Date(preview.lastSyncedAt), "PPpp")}
                </p>
              )}
              <SafeHtmlPreview html={preview?.html || ""} />
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function SyncPage() {
  return (
    <SidebarLayout>
      <div className="w-full flex flex-col gap-6 pb-12 h-full min-h-0">
        <SyncOverview />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          <KnowledgeBases />
          <SyncLogs />
        </div>
      </div>
    </SidebarLayout>
  );
}
