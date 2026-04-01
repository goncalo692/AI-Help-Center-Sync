import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const folderMappingsTable = pgTable("folder_mappings", {
  id: serial("id").primaryKey(),
  confluenceFolderId: text("confluence_folder_id").notNull(),
  confluenceFolderName: text("confluence_folder_name").notNull(),
  knowledgeSegmentName: text("knowledge_segment_name").notNull(),
  externalSourceId: text("external_source_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFolderMappingSchema = createInsertSchema(folderMappingsTable).omit({
  id: true,
  externalSourceId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFolderMapping = z.infer<typeof insertFolderMappingSchema>;
export type FolderMapping = typeof folderMappingsTable.$inferSelect;
