import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { syncLogsTable, folderMappingsTable, syncStateTable } from "@workspace/db/schema";
import {
  GetSyncStatusResponse,
  TriggerSyncResponse,
  GetSyncLogsResponse,
  ListSyncSourcesResponse,
  ListSourceDocumentsResponse,
  GetDocumentPreviewResponse,
} from "@workspace/api-zod";
import { desc, eq, sql } from "drizzle-orm";
import { runSync, getIsSyncing } from "../lib/syncJob";

const router: IRouter = Router();

router.get("/sync/status", async (_req, res) => {
  try {
    const mappings = await db.select().from(folderMappingsTable);
    const docCount = await db.select({ count: sql<number>`count(*)` }).from(syncStateTable);
    const lastLog = await db.select().from(syncLogsTable).orderBy(desc(syncLogsTable.startedAt)).limit(1);

    const response = GetSyncStatusResponse.parse({
      isRunning: getIsSyncing(),
      lastRunAt: lastLog.length > 0 ? lastLog[0].startedAt?.toISOString() : null,
      lastRunStatus: lastLog.length > 0 ? lastLog[0].status : null,
      lastRunErrored: lastLog.length > 0 ? (lastLog[0].documentsErrored || 0) : 0,
      lastRunErrorMessage: lastLog.length > 0 ? (lastLog[0].errorMessage || null) : null,
      totalMappings: mappings.length,
      totalDocumentsTracked: Number(docCount[0]?.count || 0),
    });
    res.json(response);
  } catch (err) {
    _req.log.error({ err }, "Error getting sync status");
    res.status(500).json({ message: "Failed to get sync status" });
  }
});

let lastTriggerAt = 0;
const TRIGGER_COOLDOWN_MS = 30_000; // 30 seconds

router.post("/sync/trigger", async (req, res) => {
  try {
    if (getIsSyncing()) {
      res.json(TriggerSyncResponse.parse({ message: "Sync is already in progress" }));
      return;
    }

    const now = Date.now();
    if (now - lastTriggerAt < TRIGGER_COOLDOWN_MS) {
      const waitSecs = Math.ceil((TRIGGER_COOLDOWN_MS - (now - lastTriggerAt)) / 1000);
      res.status(429).json({ message: `Please wait ${waitSecs}s before triggering again` });
      return;
    }
    lastTriggerAt = now;

    runSync().catch((err) => {
      req.log.error({ err }, "Manual sync error");
    });

    res.json(TriggerSyncResponse.parse({ message: "Sync triggered" }));
  } catch (err) {
    req.log.error({ err }, "Error triggering sync");
    res.status(500).json({ message: "Failed to trigger sync" });
  }
});

router.post("/sync/force", async (req, res) => {
  try {
    if (getIsSyncing()) {
      res.json({ message: "Sync is already in progress" });
      return;
    }

    await db
      .update(syncStateTable)
      .set({ contentHash: "", confluenceLastModified: "" });

    runSync().catch((err) => {
      req.log.error({ err }, "Force sync error");
    });

    res.json({ message: "Force sync triggered — all documents will be re-synced" });
  } catch (err) {
    req.log.error({ err }, "Error triggering force sync");
    res.status(500).json({ message: "Failed to trigger force sync" });
  }
});

router.get("/sync/logs", async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(syncLogsTable)
      .orderBy(desc(syncLogsTable.startedAt))
      .limit(20);

    const response = GetSyncLogsResponse.parse(
      logs.map((l) => ({
        id: l.id,
        startedAt: l.startedAt?.toISOString(),
        completedAt: l.completedAt?.toISOString() || null,
        status: l.status,
        documentsProcessed: l.documentsProcessed,
        documentsSkipped: l.documentsSkipped,
        documentsErrored: l.documentsErrored,
        errorMessage: l.errorMessage,
      })),
    );
    res.json(response);
  } catch (err) {
    _req.log.error({ err }, "Error getting sync logs");
    res.status(500).json({ message: "Failed to get sync logs" });
  }
});

router.get("/sync/sources", async (req, res) => {
  try {
    const mappings = await db.select().from(folderMappingsTable);

    const stats = await db
      .select({
        folderMappingId: syncStateTable.folderMappingId,
        count: sql<number>`count(*)`,
        lastSynced: sql<string>`max(${syncStateTable.lastSyncedAt})`,
      })
      .from(syncStateTable)
      .groupBy(syncStateTable.folderMappingId);

    const statsMap = new Map(stats.map((s) => [s.folderMappingId, s]));

    const sources = mappings.map((m) => {
      const s = statsMap.get(m.id);
      return {
        mappingId: m.id,
        confluenceFolderName: m.confluenceFolderName,
        knowledgeSegmentName: m.knowledgeSegmentName,
        externalSourceId: m.externalSourceId || null,
        documentCount: Number(s?.count || 0),
        lastSyncedAt: s?.lastSynced || null,
      };
    });

    res.json(ListSyncSourcesResponse.parse(sources));
  } catch (err) {
    req.log.error({ err }, "Error listing sync sources");
    res.status(500).json({ message: "Failed to list sync sources" });
  }
});

router.get("/sync/sources/:mappingId/documents", async (req, res) => {
  try {
    const mappingId = parseInt(req.params.mappingId, 10);
    if (isNaN(mappingId)) {
      res.status(400).json({ message: "Invalid mapping ID" });
      return;
    }

    const docs = await db
      .select()
      .from(syncStateTable)
      .where(eq(syncStateTable.folderMappingId, mappingId))
      .orderBy(desc(syncStateTable.lastSyncedAt));

    const response = ListSourceDocumentsResponse.parse(
      docs.map((d) => ({
        id: d.id,
        confluenceDocumentId: d.confluenceDocumentId,
        documentTitle: d.documentTitle || null,
        talkdeskDocumentId: d.talkdeskDocumentId || null,
        contentHash: d.contentHash,
        lastSyncedAt: d.lastSyncedAt?.toISOString() || null,
      })),
    );
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error listing source documents");
    res.status(500).json({ message: "Failed to list source documents" });
  }
});

router.get("/sync/documents/:documentId/preview", async (req, res) => {
  try {
    const documentId = parseInt(req.params.documentId, 10);
    if (isNaN(documentId)) {
      res.status(400).json({ message: "Invalid document ID" });
      return;
    }

    const docs = await db
      .select()
      .from(syncStateTable)
      .where(eq(syncStateTable.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      res.status(404).json({ message: "Document not found" });
      return;
    }

    const doc = docs[0];
    const response = GetDocumentPreviewResponse.parse({
      id: doc.id,
      documentTitle: doc.documentTitle || null,
      html: doc.cachedHtml || "<p>No content available</p>",
      confluenceDocumentId: doc.confluenceDocumentId,
      lastSyncedAt: doc.lastSyncedAt?.toISOString() || null,
    });
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error getting document preview");
    res.status(500).json({ message: "Failed to get document preview" });
  }
});

export default router;
