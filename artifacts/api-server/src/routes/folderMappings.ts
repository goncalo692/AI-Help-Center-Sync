import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { folderMappingsTable, syncStateTable } from "@workspace/db/schema";
import {
  CreateFolderMappingBody,
  DeleteFolderMappingParams,
  ListFolderMappingsResponse,
  DeleteFolderMappingResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { deleteExternalSource } from "../lib/talkdesk";
import { getFolderDirectChildren } from "../lib/confluence";
import { settingsTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/folder-mappings", async (_req, res) => {
  try {
    const mappings = await db.select().from(folderMappingsTable);
    const response = ListFolderMappingsResponse.parse(
      mappings.map((m) => ({
        id: m.id,
        confluenceFolderId: m.confluenceFolderId,
        confluenceFolderName: m.confluenceFolderName,
        knowledgeSegmentName: m.knowledgeSegmentName,
        externalSourceId: m.externalSourceId,
        createdAt: m.createdAt?.toISOString(),
        updatedAt: m.updatedAt?.toISOString(),
      })),
    );
    res.json(response);
  } catch (err) {
    _req.log.error({ err }, "Error listing folder mappings");
    res.status(500).json({ message: "Failed to list folder mappings" });
  }
});

router.post("/folder-mappings", async (req, res) => {
  try {
    const body = CreateFolderMappingBody.parse(req.body);

    // Check for duplicate mapping
    const existing = await db
      .select()
      .from(folderMappingsTable)
      .where(
        and(
          eq(folderMappingsTable.confluenceFolderId, body.confluenceFolderId),
          eq(folderMappingsTable.knowledgeSegmentName, body.knowledgeSegmentName),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ message: "A mapping for this folder and segment already exists" });
      return;
    }

    // Validate folder exists in Confluence
    try {
      await getFolderDirectChildren(body.confluenceFolderId);
    } catch {
      res.status(400).json({ message: "Confluence folder not found or inaccessible" });
      return;
    }

    const [mapping] = await db
      .insert(folderMappingsTable)
      .values({
        confluenceFolderId: body.confluenceFolderId,
        confluenceFolderName: body.confluenceFolderName,
        knowledgeSegmentName: body.knowledgeSegmentName,
      })
      .returning();

    res.status(201).json({
      id: mapping.id,
      confluenceFolderId: mapping.confluenceFolderId,
      confluenceFolderName: mapping.confluenceFolderName,
      knowledgeSegmentName: mapping.knowledgeSegmentName,
      externalSourceId: mapping.externalSourceId,
      createdAt: mapping.createdAt?.toISOString(),
      updatedAt: mapping.updatedAt?.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error creating folder mapping");
    res.status(500).json({ message: "Failed to create folder mapping" });
  }
});

router.delete("/folder-mappings/:id", async (req, res) => {
  try {
    const params = DeleteFolderMappingParams.parse({ id: req.params.id });
    const mappingId = Number(params.id);

    const [mapping] = await db
      .select()
      .from(folderMappingsTable)
      .where(eq(folderMappingsTable.id, mappingId))
      .limit(1);

    if (!mapping) {
      res.status(404).json({ message: "Mapping not found" });
      return;
    }

    if (mapping.externalSourceId) {
      try {
        const settings = await db.select().from(settingsTable).limit(1);
        if (settings.length > 0 && settings[0].talkdeskAccountName) {
          await deleteExternalSource(
            settings[0].talkdeskAccountName,
            settings[0].talkdeskRegion,
            mapping.externalSourceId,
          );
        }
      } catch (err) {
        req.log.warn({ err, mappingId }, "Failed to delete external source from Talkdesk");
      }
    }

    await db.delete(syncStateTable).where(eq(syncStateTable.folderMappingId, mappingId));
    await db.delete(folderMappingsTable).where(eq(folderMappingsTable.id, mappingId));

    const response = DeleteFolderMappingResponse.parse({ message: "Mapping deleted" });
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error deleting folder mapping");
    res.status(500).json({ message: "Failed to delete folder mapping" });
  }
});

export default router;
