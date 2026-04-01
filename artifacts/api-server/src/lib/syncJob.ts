import { db } from "@workspace/db";
import { settingsTable, folderMappingsTable, syncStateTable, syncLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  getFolderDirectChildren,
  getPageContent,
  getSmartLinkDetails,
  stripImages,
  getContentHash,
} from "./confluence";
import { createExternalSource, upsertDocument } from "./talkdesk";
import { logger } from "./logger";

let isSyncing = false;

export function getIsSyncing(): boolean {
  return isSyncing;
}

function buildSmartLinkHtml(title: string, embedUrl: string): string {
  return `<h2>${escapeHtml(title)}</h2><p><a href="${escapeHtml(embedUrl)}">${escapeHtml(embedUrl)}</a></p>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function syncPageItem(
  pageId: string,
  mappingId: number,
  sourceId: string,
  accountName: string,
  region: string,
): Promise<"processed" | "skipped"> {
  const existingState = await db
    .select()
    .from(syncStateTable)
    .where(eq(syncStateTable.confluenceDocumentId, pageId))
    .limit(1);

  const fullPage = await getPageContent(pageId);
  const lastModified = fullPage.version?.when || "";

  if (
    lastModified &&
    existingState.length > 0 &&
    existingState[0].confluenceLastModified === lastModified
  ) {
    return "skipped";
  }

  const rawHtml = fullPage.body?.storage?.value || "";
  const cleanHtml = stripImages(rawHtml);
  const hash = getContentHash(cleanHtml);

  if (existingState.length > 0 && existingState[0].contentHash === hash) {
    await db
      .update(syncStateTable)
      .set({ confluenceLastModified: lastModified, lastSyncedAt: new Date() })
      .where(eq(syncStateTable.id, existingState[0].id));
    return "skipped";
  }

  const docId = `confluence-${pageId}`;
  await upsertDocument(accountName, region, sourceId, docId, fullPage.title, cleanHtml);

  if (existingState.length > 0) {
    await db
      .update(syncStateTable)
      .set({
        contentHash: hash,
        confluenceLastModified: lastModified,
        talkdeskDocumentId: docId,
        documentTitle: fullPage.title,
        cachedHtml: cleanHtml,
        lastSyncedAt: new Date(),
      })
      .where(eq(syncStateTable.id, existingState[0].id));
  } else {
    await db.insert(syncStateTable).values({
      confluenceDocumentId: pageId,
      folderMappingId: mappingId,
      contentHash: hash,
      confluenceLastModified: lastModified,
      talkdeskDocumentId: docId,
      documentTitle: fullPage.title,
      cachedHtml: cleanHtml,
    });
  }

  return "processed";
}

async function syncSmartLinkItem(
  embedId: string,
  mappingId: number,
  sourceId: string,
  accountName: string,
  region: string,
): Promise<"processed" | "skipped"> {
  const embed = await getSmartLinkDetails(embedId);

  if (!embed.embedUrl) {
    logger.warn({ embedId }, "Smart link has no embedUrl, skipping");
    return "skipped";
  }

  const lastModified = embed.version?.createdAt || "";

  const existingState = await db
    .select()
    .from(syncStateTable)
    .where(eq(syncStateTable.confluenceDocumentId, `embed-${embedId}`))
    .limit(1);

  if (
    lastModified &&
    existingState.length > 0 &&
    existingState[0].confluenceLastModified === lastModified
  ) {
    return "skipped";
  }

  const html = buildSmartLinkHtml(embed.title || embed.embedUrl, embed.embedUrl);
  const hash = getContentHash(html);

  if (existingState.length > 0 && existingState[0].contentHash === hash) {
    await db
      .update(syncStateTable)
      .set({ confluenceLastModified: lastModified, lastSyncedAt: new Date() })
      .where(eq(syncStateTable.id, existingState[0].id));
    return "skipped";
  }

  const docId = `confluence-embed-${embedId}`;
  const title = embed.title || `Smart Link: ${embed.embedUrl}`;
  await upsertDocument(accountName, region, sourceId, docId, title, html);

  if (existingState.length > 0) {
    await db
      .update(syncStateTable)
      .set({
        contentHash: hash,
        confluenceLastModified: lastModified,
        talkdeskDocumentId: docId,
        documentTitle: title,
        cachedHtml: html,
        lastSyncedAt: new Date(),
      })
      .where(eq(syncStateTable.id, existingState[0].id));
  } else {
    await db.insert(syncStateTable).values({
      confluenceDocumentId: `embed-${embedId}`,
      folderMappingId: mappingId,
      contentHash: hash,
      confluenceLastModified: lastModified,
      talkdeskDocumentId: docId,
      documentTitle: title,
      cachedHtml: html,
    });
  }

  return "processed";
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
  const errorMessages: string[] = [];

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

        const children = await getFolderDirectChildren(mapping.confluenceFolderId);
        const pages = children.filter((c) => c.type === "page");
        const embeds = children.filter((c) => c.type === "embed");
        const otherCount = children.length - pages.length - embeds.length;
        logger.info(
          { folderId: mapping.confluenceFolderId, pages: pages.length, embeds: embeds.length, skippedOther: otherCount },
          "Found folder children",
        );

        for (const child of pages) {
          try {
            const result = await syncPageItem(
              child.id,
              mapping.id,
              sourceId,
              config.talkdeskAccountName,
              config.talkdeskRegion,
            );
            if (result === "processed") processed++;
            else skipped++;
          } catch (pageErr) {
            const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
            logger.error({ err: pageErr, pageId: child.id }, "Error processing page");
            errorMessages.push(`Page ${child.id}: ${msg}`);
            errored++;
          }
        }

        for (const child of embeds) {
          try {
            const result = await syncSmartLinkItem(
              child.id,
              mapping.id,
              sourceId,
              config.talkdeskAccountName,
              config.talkdeskRegion,
            );
            if (result === "processed") processed++;
            else skipped++;
          } catch (embedErr) {
            const msg = embedErr instanceof Error ? embedErr.message : String(embedErr);
            logger.error({ err: embedErr, embedId: child.id }, "Error processing smart link");
            errorMessages.push(`Embed ${child.id}: ${msg}`);
            errored++;
          }
        }
      } catch (mappingErr) {
        const msg = mappingErr instanceof Error ? mappingErr.message : String(mappingErr);
        logger.error({ err: mappingErr, mappingId: mapping.id }, "Error processing mapping");
        errorMessages.push(`Mapping ${mapping.knowledgeSegmentName}: ${msg}`);
        errored++;
      }
    }

    const combinedErrors = errorMessages.length > 0 ? errorMessages.join("\n") : undefined;

    await db
      .update(syncLogsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        documentsProcessed: processed,
        documentsSkipped: skipped,
        documentsErrored: errored,
        errorMessage: combinedErrors,
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
