import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { GetConfluenceFoldersResponse } from "@workspace/api-zod";
import { getFoldersInSpace } from "../lib/confluence";

const router: IRouter = Router();

router.get("/confluence/folders", async (req, res) => {
  try {
    const settings = await db.select().from(settingsTable).limit(1);
    const spaceKey = settings.length > 0 ? settings[0].confluenceSpaceKey : "AHC";

    const folders = await getFoldersInSpace(spaceKey);

    const response = GetConfluenceFoldersResponse.parse(
      folders.map((f) => ({
        id: f.id,
        title: f.title,
        hasChildren: true,
      })),
    );
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error getting Confluence folders");
    res.status(500).json({ message: "Failed to get Confluence folders" });
  }
});

export default router;
