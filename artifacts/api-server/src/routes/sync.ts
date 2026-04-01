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
import { desc, eq, sql, max } from "drizzle-orm";
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

router.post("/sync/trigger", async (req, res) => {
  try {
    if (getIsSyncing()) {
      res.json(TriggerSyncResponse.parse({ message: "Sync is already in progress" }));
      return;
    }

    runSync().catch((err) => {
      req.log.error({ err }, "Manual sync error");
    });

    res.json(TriggerSyncResponse.parse({ message: "Sync triggered" }));
  } catch (err) {
    req.log.error({ err }, "Error triggering sync");
    res.status(500).json({ message: "Failed to trigger sync" });
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
    const sources = [];

    for (const m of mappings) {
      const docs = await db
        .select({
          count: sql<number>`count(*)`,
          lastSynced: max(syncStateTable.lastSyncedAt),
        })
        .from(syncStateTable)
        .where(eq(syncStateTable.folderMappingId, m.id));

      sources.push({
        mappingId: m.id,
        confluenceFolderName: m.confluenceFolderName,
        knowledgeSegmentName: m.knowledgeSegmentName,
        externalSourceId: m.externalSourceId || null,
        documentCount: Number(docs[0]?.count || 0),
        lastSyncedAt: docs[0]?.lastSynced?.toISOString() || null,
      });
    }

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
