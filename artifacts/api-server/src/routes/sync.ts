import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { syncLogsTable, folderMappingsTable, syncStateTable } from "@workspace/db/schema";
import { GetSyncStatusResponse, TriggerSyncResponse, GetSyncLogsResponse } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { runSync, getIsSyncing } from "../lib/syncJob";
import { sql } from "drizzle-orm";

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

export default router;
