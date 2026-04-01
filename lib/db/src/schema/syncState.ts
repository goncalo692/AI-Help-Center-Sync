import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { folderMappingsTable } from "./folderMappings";

export const syncStateTable = pgTable("sync_state", {
  id: serial("id").primaryKey(),
  confluenceDocumentId: text("confluence_document_id").notNull().unique(),
  folderMappingId: integer("folder_mapping_id").notNull().references(() => folderMappingsTable.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  confluenceLastModified: text("confluence_last_modified"),
  talkdeskDocumentId: text("talkdesk_document_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

export type SyncState = typeof syncStateTable.$inferSelect;
