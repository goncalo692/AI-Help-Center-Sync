import { db } from "@workspace/db";
import { settingsTable, folderMappingsTable, syncStateTable, syncLogsTable } from "@workspace/db/schema";
import { eq, and, notInArray, desc, lt } from "drizzle-orm";
import {
  getFolderDirectChildren,
  getPageContent,
  getPageVersion,
  getSmartLinkDetails,
  buildPageUrl,
  stripImages,
  getContentHash,
} from "./confluence";
import { createExternalSource, upsertDocument, deleteDocument } from "./talkdesk";
import { logger } from "./logger";

const CONCURRENCY = 5;
const MAX_SYNC_LOGS = 200;

let isSyncing = false;

export function getIsSyncing(): boolean {
  return isSyncing;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSmartLinkHtml(title: string, embedUrl: string): string {
  return `<h2>${escapeHtml(title)}</h2><p><a href="${escapeHtml(embedUrl)}">${escapeHtml(embedUrl)}</a></p>`;
}

async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

async function syncPageItem(
  pageId: string,
  mappingId: number,
  sourceId: string,
  accountName: string,
  region: string,
  counters: { processed: number; skipped: number; errored: number; errors: string[] },
): Promise<void> {
  try {
    // Lightweight v2 call: returns version + status + createdAt without body
    const pageInfo = await getPageVersion(pageId);

    // Skip non-current pages (archived, trashed, draft)
    if (pageInfo.status !== "current") {
      logger.info({ pageId, status: pageInfo.status }, "Skipping non-current page");
      counters.skipped++;
      return;
    }

    const lastModified = pageInfo.version?.createdAt || "";

    const existingState = await db
      .select()
      .from(syncStateTable)
      .where(eq(syncStateTable.confluenceDocumentId, pageId))
      .limit(1);

    if (
      lastModified &&
      existingState.length > 0 &&
      existingState[0].confluenceLastModified === lastModified
    ) {
      counters.skipped++;
      return;
    }

    // Full v2 call with body content
    const fullPage = await getPageContent(pageId);
    const rawHtml = fullPage.body?.storage?.value || "";
    const cleanHtml = stripImages(rawHtml);
    const hash = getContentHash(cleanHtml);

    if (existingState.length > 0 && existingState[0].contentHash === hash) {
      await db
        .update(syncStateTable)
        .set({ confluenceLastModified: lastModified, lastSyncedAt: new Date() })
        .where(eq(syncStateTable.id, existingState[0].id));
      counters.skipped++;
      return;
    }

    const isNew = existingState.length === 0;
    const docId = `confluence-${pageId}`;
    const sourceUrl = buildPageUrl(fullPage);
    const createdAt = isNew ? (fullPage.createdAt || new Date().toISOString()) : undefined;

    await upsertDocument(accountName, region, sourceId, docId, fullPage.title, cleanHtml, sourceUrl, isNew, createdAt);

    if (!isNew) {
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

    counters.processed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, pageId }, "Error processing page");
    counters.errors.push(`Page ${pageId}: ${msg}`);
    counters.errored++;
  }
}

async function syncSmartLinkItem(
  embedId: string,
  mappingId: number,
  sourceId: string,
  accountName: string,
  region: string,
  counters: { processed: number; skipped: number; errored: number; errors: string[] },
): Promise<void> {
  try {
    const embed = await getSmartLinkDetails(embedId);

    if (!embed.embedUrl) {
      logger.warn({ embedId }, "Smart link has no embedUrl, skipping");
      counters.skipped++;
      return;
    }

    // Skip non-current embeds
    if (embed.status !== "current") {
      logger.info({ embedId, status: embed.status }, "Skipping non-current embed");
      counters.skipped++;
      return;
    }

    const lastModified = embed.version?.createdAt || "";
    const confluenceDocId = `embed-${embedId}`;

    const existingState = await db
      .select()
      .from(syncStateTable)
      .where(eq(syncStateTable.confluenceDocumentId, confluenceDocId))
      .limit(1);

    if (
      lastModified &&
      existingState.length > 0 &&
      existingState[0].confluenceLastModified === lastModified
    ) {
      counters.skipped++;
      return;
    }

    const html = buildSmartLinkHtml(embed.title || embed.embedUrl, embed.embedUrl);
    const hash = getContentHash(html);

    if (existingState.length > 0 && existingState[0].contentHash === hash) {
      await db
        .update(syncStateTable)
        .set({ confluenceLastModified: lastModified, lastSyncedAt: new Date() })
        .where(eq(syncStateTable.id, existingState[0].id));
      counters.skipped++;
      return;
    }

    const isNew = existingState.length === 0;
    const docId = `confluence-embed-${embedId}`;
    const title = embed.title || `Smart Link: ${embed.embedUrl}`;
    await upsertDocument(accountName, region, sourceId, docId, title, html, embed.embedUrl, isNew);

    if (!isNew) {
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
        confluenceDocumentId: confluenceDocId,
        folderMappingId: mappingId,
        contentHash: hash,
        confluenceLastModified: lastModified,
        talkdeskDocumentId: docId,
        documentTitle: title,
        cachedHtml: html,
      });
    }

    counters.processed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, embedId }, "Error processing smart link");
    counters.errors.push(`Embed ${embedId}: ${msg}`);
    counters.errored++;
  }
}

async function removeOrphanedDocuments(
  mappingId: number,
  sourceId: string,
  accountName: string,
  region: string,
  currentDocIds: string[],
  counters: { processed: number; errored: number; errors: string[] },
): Promise<void> {
  if (currentDocIds.length === 0) return;

  const orphaned = await db
    .select()
    .from(syncStateTable)
    .where(
      and(
        eq(syncStateTable.folderMappingId, mappingId),
        notInArray(syncStateTable.confluenceDocumentId, currentDocIds),
      ),
    );

  for (const doc of orphaned) {
    try {
      if (doc.talkdeskDocumentId) {
        await deleteDocument(accountName, region, sourceId, doc.talkdeskDocumentId);
      }
      await db.delete(syncStateTable).where(eq(syncStateTable.id, doc.id));
      logger.info({ docId: doc.confluenceDocumentId, title: doc.documentTitle }, "Removed orphaned document");
      counters.processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, docId: doc.confluenceDocumentId }, "Error removing orphaned document");
      counters.errors.push(`Orphan ${doc.confluenceDocumentId}: ${msg}`);
      counters.errored++;
    }
  }
}

async function pruneSyncLogs(): Promise<void> {
  try {
    const cutoff = await db
      .select({ id: syncLogsTable.id })
      .from(syncLogsTable)
      .orderBy(desc(syncLogsTable.startedAt))
      .limit(1)
      .offset(MAX_SYNC_LOGS);

    if (cutoff.length > 0) {
      await db
        .delete(syncLogsTable)
        .where(lt(syncLogsTable.id, cutoff[0].id));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to prune sync logs");
  }
}

export async function runSync(): Promise<void> {
  if (isSyncing) {
    logger.info("Sync already in progress, skipping");
    return;
  }

  isSyncing = true;

  const [logEntry] = await db.insert(syncLogsTable).values({}).returning();

  const counters = { processed: 0, skipped: 0, errored: 0, errors: [] as string[] };

  try {
    const settings = await db.select().from(settingsTable).limit(1);
    if (settings.length === 0) {
      logger.warn("No settings configured, skipping sync");
      await db
        .update(syncLogsTable)
        .set({ status: "skipped", completedAt: new Date(), errorMessage: "No settings configured" })
        .where(eq(syncLogsTable.id, logEntry.id));
      return;
    }

    const config = settings[0];
    if (!config.talkdeskAccountName) {
      logger.warn("Talkdesk account name not set, skipping sync");
      await db
        .update(syncLogsTable)
        .set({ status: "skipped", completedAt: new Date(), errorMessage: "Talkdesk account name not set" })
        .where(eq(syncLogsTable.id, logEntry.id));
      return;
    }

    const mappings = await db.select().from(folderMappingsTable);
    if (mappings.length === 0) {
      logger.info("No folder mappings configured, nothing to sync");
      await db
        .update(syncLogsTable)
        .set({ status: "completed", completedAt: new Date(), errorMessage: "No folder mappings" })
        .where(eq(syncLogsTable.id, logEntry.id));
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
            mapping.knowledgeSegmentName, // knowledge_segments
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

        await runInBatches(
          pages,
          (child) => syncPageItem(child.id, mapping.id, sourceId!, config.talkdeskAccountName, config.talkdeskRegion, counters),
          CONCURRENCY,
        );

        await runInBatches(
          embeds,
          (child) => syncSmartLinkItem(child.id, mapping.id, sourceId!, config.talkdeskAccountName, config.talkdeskRegion, counters),
          CONCURRENCY,
        );

        // Remove documents that no longer exist in Confluence
        const currentDocIds = [
          ...pages.map((p) => p.id),
          ...embeds.map((e) => `embed-${e.id}`),
        ];
        await removeOrphanedDocuments(
          mapping.id,
          sourceId!,
          config.talkdeskAccountName,
          config.talkdeskRegion,
          currentDocIds,
          counters,
        );
      } catch (mappingErr) {
        const msg = mappingErr instanceof Error ? mappingErr.message : String(mappingErr);
        logger.error({ err: mappingErr, mappingId: mapping.id }, "Error processing mapping");
        counters.errors.push(`Mapping ${mapping.knowledgeSegmentName}: ${msg}`);
        counters.errored++;
      }
    }

    const combinedErrors = counters.errors.length > 0 ? counters.errors.join("\n") : undefined;

    await db
      .update(syncLogsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        documentsProcessed: counters.processed,
        documentsSkipped: counters.skipped,
        documentsErrored: counters.errored,
        errorMessage: combinedErrors,
      })
      .where(eq(syncLogsTable.id, logEntry.id));

    logger.info({ processed: counters.processed, skipped: counters.skipped, errored: counters.errored }, "Sync completed");

    await pruneSyncLogs();
  } catch (err) {
    logger.error({ err }, "Sync failed");
    await db
      .update(syncLogsTable)
      .set({
        status: "error",
        completedAt: new Date(),
        documentsProcessed: counters.processed,
        documentsSkipped: counters.skipped,
        documentsErrored: counters.errored,
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
