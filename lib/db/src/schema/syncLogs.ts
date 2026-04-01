import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("running"),
  documentsProcessed: integer("documents_processed").notNull().default(0),
  documentsSkipped: integer("documents_skipped").notNull().default(0),
  documentsErrored: integer("documents_errored").notNull().default(0),
  errorMessage: text("error_message"),
});

export type SyncLog = typeof syncLogsTable.$inferSelect;
