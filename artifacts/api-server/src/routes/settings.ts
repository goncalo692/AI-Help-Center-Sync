import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { restartSyncScheduler } from "../lib/syncJob";

const router: IRouter = Router();

router.get("/settings", async (_req, res) => {
  try {
    const settings = await db.select().from(settingsTable).limit(1);

    if (settings.length === 0) {
      const response = GetSettingsResponse.parse({
        id: 0,
        talkdeskAccountName: "",
        talkdeskRegion: "US",
        confluenceSpaceKey: "",
        syncIntervalMinutes: 5,
        updatedAt: null,
      });
      res.json(response);
      return;
    }

    const s = settings[0];
    const response = GetSettingsResponse.parse({
      id: s.id,
      talkdeskAccountName: s.talkdeskAccountName,
      talkdeskRegion: s.talkdeskRegion,
      confluenceSpaceKey: s.confluenceSpaceKey,
      syncIntervalMinutes: s.syncIntervalMinutes,
      updatedAt: s.updatedAt?.toISOString(),
    });
    res.json(response);
  } catch (err) {
    _req.log.error({ err }, "Error getting settings");
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);

    let settings = await db.select().from(settingsTable).limit(1);

    const intervalMinutes = Math.max(1, Math.min(60, body.syncIntervalMinutes));

    if (settings.length === 0) {
      const [created] = await db
        .insert(settingsTable)
        .values({
          talkdeskAccountName: body.talkdeskAccountName,
          talkdeskRegion: body.talkdeskRegion,
          confluenceSpaceKey: body.confluenceSpaceKey,
          syncIntervalMinutes: intervalMinutes,
          updatedAt: new Date(),
        })
        .returning();
      settings = [created];
    } else {
      const [updated] = await db
        .update(settingsTable)
        .set({
          talkdeskAccountName: body.talkdeskAccountName,
          talkdeskRegion: body.talkdeskRegion,
          confluenceSpaceKey: body.confluenceSpaceKey,
          syncIntervalMinutes: intervalMinutes,
          updatedAt: new Date(),
        })
        .where(eq(settingsTable.id, settings[0].id))
        .returning();
      settings = [updated];
    }

    // Restart scheduler with new interval
    restartSyncScheduler(intervalMinutes);

    const s = settings[0];
    const response = UpdateSettingsResponse.parse({
      id: s.id,
      talkdeskAccountName: s.talkdeskAccountName,
      talkdeskRegion: s.talkdeskRegion,
      confluenceSpaceKey: s.confluenceSpaceKey,
      syncIntervalMinutes: s.syncIntervalMinutes,
      updatedAt: s.updatedAt?.toISOString(),
    });
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error updating settings");
    res.status(500).json({ message: "Failed to update settings" });
  }
});

export default router;
