import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  talkdeskAccountName: text("talkdesk_account_name").notNull().default(""),
  talkdeskRegion: text("talkdesk_region").notNull().default("US"),
  confluenceSpaceKey: text("confluence_space_key").notNull().default("AHC"),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(5),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
