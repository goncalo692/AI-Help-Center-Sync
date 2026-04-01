import { db } from "@workspace/db";
import { settingsTable, folderMappingsTable, syncStateTable, syncLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getChildPages, getPageContent, stripImages, getContentHash } from "./confluence";
import { createExternalSource, upsertDocument } from "./talkdesk";
import { logger } from "./logger";

let isSyncing = false;

export function getIsSyncing(): boolean {
  return isSyncing;
}

export async function runSync(): Promise<void> {
  if (isSyncing) {
    logger.info("Sync already in progress, skipping");
    return;
  }

  isSyncing = true;

  const [logEntry] = await db.insert(syncLogsTable).values({}).returning();

  let processed = 0;
  let skipped = 0;
  let errored = 0;

  try {
    const settings = await db.select().from(settingsTable).limit(1);
    if (settings.length === 0) {
      logger.warn("No settings configured, skipping sync");
      await db
        .update(syncLogsTable)
        .set({ status: "skipped", completedAt: new Date(), errorMessage: "No settings configured" })
        .where(eq(syncLogsTable.id, logEntry.id));
      isSyncing = false;
      return;
    }

    const config = settings[0];
    if (!config.talkdeskAccountName) {
      logger.warn("Talkdesk account name not set, skipping sync");
      await db
        .update(syncLogsTable)
        .set({ status: "skipped", completedAt: new Date(), errorMessage: "Talkdesk account name not set" })
        .where(eq(syncLogsTable.id, logEntry.id));
      isSyncing = false;
      return;
    }

    const mappings = await db.select().from(folderMappingsTable);
    if (mappings.length === 0) {
      logger.info("No folder mappings configured, nothing to sync");
      await db
        .update(syncLogsTable)
        .set({ status: "completed", completedAt: new Date(), errorMessage: "No folder mappings" })
        .where(eq(syncLogsTable.id, logEntry.id));
      isSyncing = false;
      return;
    }

    for (const mapping of mappings) {
      try {
        let sourceId = mapping.externalSourceId;
        if (!sourceId) {
          logger.info({ mappingId: mapping.id, segment: mapping.knowledgeSegmentName }, "Creating external source");
          const source = await createExternalSource(
            config.talkdeskAccountName,
            config.talkdeskRegion,
            mapping.knowledgeSegmentName,
          );
          sourceId = source.id;
          await db
            .update(folderMappingsTable)
            .set({ externalSourceId: sourceId, updatedAt: new Date() })
            .where(eq(folderMappingsTable.id, mapping.id));
        }

        const childPages = await getChildPages(mapping.confluenceFolderId);
        logger.info({ folderId: mapping.confluenceFolderId, pageCount: childPages.length }, "Found child pages");

        for (const page of childPages) {
          try {
            const existingState = await db
              .select()
              .from(syncStateTable)
              .where(eq(syncStateTable.confluenceDocumentId, page.id))
              .limit(1);

            const lastModified = page.version?.when || "";

            if (
              existingState.length > 0 &&
              existingState[0].confluenceLastModified === lastModified
            ) {
              skipped++;
              continue;
            }

            const fullPage = await getPageContent(page.id);
            const rawHtml = fullPage.body?.storage?.value || "";
            const cleanHtml = stripImages(rawHtml);
            const hash = getContentHash(cleanHtml);

            if (existingState.length > 0 && existingState[0].contentHash === hash) {
              await db
                .update(syncStateTable)
                .set({ confluenceLastModified: lastModified, lastSyncedAt: new Date() })
                .where(eq(syncStateTable.id, existingState[0].id));
              skipped++;
              continue;
            }

            const docId = `confluence-${page.id}`;
            await upsertDocument(
              config.talkdeskAccountName,
              config.talkdeskRegion,
              sourceId,
              docId,
              page.title,
              cleanHtml,
            );

            if (existingState.length > 0) {
              await db
                .update(syncStateTable)
                .set({
                  contentHash: hash,
                  confluenceLastModified: lastModified,
                  talkdeskDocumentId: docId,
                  documentTitle: page.title,
                  cachedHtml: cleanHtml,
                  lastSyncedAt: new Date(),
                })
                .where(eq(syncStateTable.id, existingState[0].id));
            } else {
              await db.insert(syncStateTable).values({
                confluenceDocumentId: page.id,
                folderMappingId: mapping.id,
                contentHash: hash,
                confluenceLastModified: lastModified,
                talkdeskDocumentId: docId,
                documentTitle: page.title,
                cachedHtml: cleanHtml,
              });
            }

            processed++;
          } catch (pageErr) {
            logger.error({ err: pageErr, pageId: page.id }, "Error processing page");
            errored++;
          }
        }
      } catch (mappingErr) {
        logger.error({ err: mappingErr, mappingId: mapping.id }, "Error processing mapping");
        errored++;
      }
    }

    await db
      .update(syncLogsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        documentsProcessed: processed,
        documentsSkipped: skipped,
        documentsErrored: errored,
      })
      .where(eq(syncLogsTable.id, logEntry.id));

    logger.info({ processed, skipped, errored }, "Sync completed");
  } catch (err) {
    logger.error({ err }, "Sync failed");
    await db
      .update(syncLogsTable)
      .set({
        status: "error",
        completedAt: new Date(),
        documentsProcessed: processed,
        documentsSkipped: skipped,
        documentsErrored: errored,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncLogsTable.id, logEntry.id));
  } finally {
    isSyncing = false;
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): void {
  if (syncInterval) return;

  logger.info("Starting sync scheduler (every 5 minutes)");
  syncInterval = setInterval(() => {
    runSync().catch((err) => {
      logger.error({ err }, "Scheduled sync error");
    });
  }, 5 * 60 * 1000);
}

export function stopSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
